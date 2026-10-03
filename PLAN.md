# Implementation plan — Boxchain (crate: `chaind_logistics`)

Every step is one small, reviewable increment. A step is done when its files compile, its tests pass, and you have reviewed the diff:

```bash
cargo fmt --check && cargo clippy && cargo test -p chaind_logistics && anchor test
```

Status today: `lib.rs` lists all 11 instructions; every handler is an empty stub. The `Counter` leftovers in `constants.rs`, `error.rs` and `state.rs` are unused.

---

## Design decisions (locked)

| Topic | Decision |
|---|---|
| Parties | 3PL (`provider`), `client`, `courier` — all three on-chain, all three distinct wallets |
| Money | SOL lamports only. Escrow = the Order PDA's own lamports (no separate vault account) |
| Who confirms delivery | Courier (trusted — listed as a known limit) |
| Payout | On `confirm_delivery`: `fulfillment_price` → 3PL, `shipment_price` → courier, in one instruction |
| Order ids | Sequential per agreement: `order_id` must equal `agreement.next_order_id` |
| Rent | 3PL pays rent for Agreement and Order. Accounts are never closed, so history stays readable (~0.002 SOL each stays locked) |
| Admin | None. No instruction can edit an agreement or touch escrow outside the rules below |

## Order state machine

```
            set_*_price (stays Created)
               ┌────┐
               ▼    │
 create_order ─► Created ──mark_processed──► Processed ──pay──► Paid ──send_invoice──► Invoiced ──confirm_delivery──► Closed
                   │                            │                │                        │
                   └──────cancel_order──────────┴──► Cancelled   └─────refund_expired─────┴──► Refunded
                                                                   (only after paid_at + timeout)
```

| Action | Allowed from | Goes to | Signer |
|---|---|---|---|
| `SetPrice` | Created | Created | 3PL |
| `MarkProcessed` | Created | Processed | 3PL |
| `Pay` | Processed | Paid | Client |
| `SendInvoice` | Paid | Invoiced | 3PL |
| `ConfirmDelivery` | Invoiced | Closed | Courier |
| `Cancel` | Created, Processed | Cancelled | 3PL or client |
| `RefundExpired` | Paid, Invoiced | Refunded | Client |

Terminal: `Closed`, `Cancelled`, `Refunded`. Nothing leaves a terminal state.

"Party disappears" coverage:
- 3PL gone before payment → client cancels.
- 3PL or courier gone after payment → client refunds after timeout.
- Client gone after payment → courier still confirms delivery → `Closed`.

---

## Phase 0 — Housekeeping

**Step 0.1 — toolchain.** `rust-toolchain.toml` says `1.89.0`, AGENTS.md says `1.95.0`. Set `channel = "1.95.0"` and `rust-version = "1.95.0"` in `Cargo.toml`. Check that `anchor build` still works in the container.

**Step 0.2 — remove counter leftovers.** Empty `constants.rs`, `error.rs`, `state.rs` of counter code (they get refilled in Phase 1).

## Phase 1 — Data (no behaviour yet)

**Step 1.1 — `constants.rs`**
- `AGREEMENT_SEED = b"agreement"`, `ORDER_SEED = b"order"`
- `MAX_DELIVERY_TIMEOUT: i64 = 90 * 24 * 60 * 60` (90 days — funds can never be locked longer)
- `MIN_DELIVERY_TIMEOUT: i64 = 1` (lets tests use a 2-second timeout)

**Step 1.2 — `state.rs`** (fixed-size fields only; new fields are appended, never reordered)

```text
Agreement  seeds ["agreement", provider, client]
  provider: Pubkey
  client: Pubkey
  courier: Pubkey
  delivery_timeout: i64      seconds
  accepted: bool
  next_order_id: u64
  bump: u8

OrderStatus (enum, 1 byte)
  Created, Processed, Paid, Invoiced, Closed, Cancelled, Refunded

Order  seeds ["order", agreement, order_id.to_le_bytes()]
  agreement: Pubkey
  order_id: u64
  status: OrderStatus
  fulfillment_price: u64     lamports
  shipment_price: u64        lamports
  created_at: i64
  paid_at: i64               0 until paid
  invoice_hash: [u8; 32]     zeroes until invoiced
  bump: u8
```

Both structs: `#[account]` + `#[derive(InitSpace)]`; space = `8 + X::INIT_SPACE`.

**Step 1.3 — `error.rs`** (append-only; each with a user-readable `#[msg]`)

| Variant | Message |
|---|---|
| `InvalidTimeout` | Delivery timeout must be between 1 second and 90 days |
| `PartiesNotDistinct` | 3PL, client and courier must be three different wallets |
| `AlreadyAccepted` | This agreement has already been accepted |
| `AgreementNotAccepted` | The client has not accepted this agreement yet |
| `WrongOrderId` | Order id must be the next id for this agreement |
| `InvalidTransition` | This action is not allowed in the order's current status |
| `PriceNotSet` | Set the fulfillment and shipment prices first |
| `TotalMismatch` | The amount you approved does not match the order total |
| `NotAParty` | Only the 3PL or the client can do this |
| `NotExpired` | The delivery deadline has not passed yet |
| `MathOverflow` | Amount is too large |

**Step 1.4 — `events.rs`** (one per state change; add `pub mod events;` to `lib.rs`)
`AgreementCreated`, `AgreementAccepted`, `OrderCreated`, `PriceSet { fulfillment_price, shipment_price }`, `OrderProcessed`, `OrderPaid { total }`, `InvoiceSent { invoice_hash }`, `OrderClosed { to_provider, to_courier }`, `OrderCancelled { by }`, `OrderRefunded { amount }`. Each carries `agreement` and/or `order` pubkeys.

## Phase 2 — Pure logic (unit-tested, no Solana)

**Step 2.1 — `state_machine.rs`**
- `enum Action { SetPrice, MarkProcessed, Pay, SendInvoice, ConfirmDelivery, Cancel, RefundExpired }`
- `pub fn next(from: OrderStatus, action: Action) -> Result<OrderStatus>` — implements the table above, everything else → `InvalidTransition`.
- `impl Order { pub fn apply(&mut self, action: Action) -> Result<()> }` — the **only** place that writes `status`.
- `#[cfg(test)]`: every allowed transition succeeds; every (status, action) pair not in the table fails; terminal states reject everything.

**Step 2.2 — `math.rs`**
- `total(fulfillment, shipment) -> Result<u64>` — `checked_add`, else `MathOverflow`.
- `deadline(paid_at, timeout) -> Result<i64>` — `checked_add`.
- `is_expired(now, paid_at, timeout) -> Result<bool>` — `now >= deadline`.
- `#[cfg(test)]`: normal values, `u64::MAX` overflow, exact-deadline boundary.

## Phase 3 — Instructions (one per step, each with its integration tests)

General rules for every handler: validate → mutate state (via `apply`) → emit event → transfer. No `unwrap`. Every check gets `// ENFORCES: <rule>`.

**Step 3.1 — `init_agreement(courier: Pubkey, delivery_timeout: i64)`** — *signature change: adds `courier`*
- Accounts: `provider: Signer (mut)`, `client: UncheckedAccount` (just a key), `agreement: init, payer = provider, seeds = [AGREEMENT_SEED, provider, client]`, `system_program`.
- Checks: timeout in range; provider ≠ client ≠ courier ≠ provider.
- Sets all fields, `accepted = false`, `next_order_id = 0`, `bump`.
- Event `AgreementCreated`.
- Tests: happy path reads back all fields; bad timeout fails; duplicate parties fail; second init for same pair fails.

**Step 3.2 — `accept_agreement`**
- Accounts: `client: Signer`, `agreement: mut, seeds, bump = agreement.bump, has_one = client`.
- Checks: `!accepted`.
- Sets `accepted = true`. Event.
- Tests: client accepts; 3PL cannot accept; accepting twice fails.

**Step 3.3 — `create_order(order_id: u64)`**
- Accounts: `provider: Signer (mut)`, `agreement: mut, has_one = provider`, `order: init, payer = provider, seeds = [ORDER_SEED, agreement, order_id.to_le_bytes()]`, `system_program`.
- Checks: `agreement.accepted`; `order_id == next_order_id`.
- Sets order fields (status `Created`, `created_at = Clock`), `next_order_id += 1` (checked). Event.
- Tests: creates order 0 then 1; wrong id fails; before acceptance fails; client cannot create.

**Step 3.4 — `set_fulfillment_price(lamports)` and `set_shipment_price(lamports)`**
- Accounts: `provider: Signer`, `agreement: has_one = provider`, `order: mut, has_one = agreement`.
- Checks: `apply(SetPrice)` (only while `Created`); `total()` still fits in u64.
- Event `PriceSet`.
- Tests: prices stored; client cannot set; setting after `Processed` fails.

**Step 3.5 — `mark_processed`**
- Same accounts as 3.4.
- Checks: total > 0 (`PriceNotSet`); `apply(MarkProcessed)`. Event.
- Tests: moves to `Processed`; without prices fails; twice fails.

**Step 3.6 — `pay(expected_total: u64)`**
- Accounts: `client: Signer (mut)`, `agreement: has_one = client`, `order: mut, has_one = agreement`, `system_program`.
- Checks: `expected_total == total()` (`TotalMismatch`); `apply(Pay)`.
- Sets `paid_at = Clock`. Event. **Then** `system_program::transfer` client → order PDA for `total`.
- Tests: order lamports grow by exactly total; wrong expected_total fails; paying twice fails; 3PL cannot pay.

**Step 3.7 — `send_invoice(invoice_hash: [u8; 32])`**
- Accounts like 3.4. Checks `apply(SendInvoice)`. Stores hash. Event.
- Tests: hash stored; before payment fails.

**Step 3.8 — `confirm_delivery`**
- Accounts: `courier: Signer (mut)`, `provider: SystemAccount (mut)`, `agreement: has_one = courier, has_one = provider`, `order: mut, has_one = agreement`.
- Checks: `apply(ConfirmDelivery)`. Event.
- Transfer: `order.sub_lamports(fulfillment)`, `provider.add_lamports(fulfillment)`, `order.sub_lamports(shipment)`, `courier.add_lamports(shipment)` (Anchor's checked lamport helpers; a program-owned PDA can't use a system transfer). Rent stays in the order.
- Tests: exact balance deltas for 3PL and courier; client/3PL cannot confirm; confirm before invoice fails; wrong provider account fails.

**Step 3.9 — `cancel_order`**
- Accounts: `signer: Signer`, `agreement`, `order: mut, has_one = agreement`.
- Checks: signer is `agreement.provider` or `agreement.client` (`NotAParty`); `apply(Cancel)`. Event.
- Tests: both parties can cancel; courier cannot; cancel after `Paid` fails.

**Step 3.10 — `refund_expired`**
- Accounts: `client: Signer (mut)`, `agreement: has_one = client`, `order: mut, has_one = agreement`.
- Checks: `is_expired(now, paid_at, timeout)` (`NotExpired`); `apply(RefundExpired)`. Event.
- Transfer: `order.sub_lamports(total)`, `client.add_lamports(total)`.
- Tests: refund before deadline fails; with a 2-second timeout, sleep 3 s, refund succeeds with exact delta; works from `Invoiced` too; courier confirm after refund fails.

**Step 3.11 — full happy-path test** — one test that walks agreement → order → `Closed` and checks all three balances at the end.

## Phase 4 — Tooling & devnet

**Step 4.1 — `scripts/sync-idl.sh`**: copy `target/idl/chaind_logistics.json` and `target/types/chaind_logistics.ts` into `app/src/idl/`.

**Step 4.2 — devnet deploy.** Back up `target/deploy/chaind_logistics-keypair.json` (outside git). `anchor deploy --provider.cluster devnet`, then `anchor idl init` so Explorer decodes our instructions. *Ask before running.*

**Step 4.3 — `scripts/seed-demo.ts`**: creates three funded devnet wallets (or reads them from files outside git), runs agreement + one order up to `Processed`, prints the addresses for the demo.

## Phase 5 — UI (`app/`, Vite + React + `@anchor-lang/core` + Wallet Adapter)

**Step 5.1** — scaffold Vite React-TS app, Wallet Adapter (Phantom/Solflare), devnet connection, `Program` from synced IDL.
**Step 5.2** — role detection: connected wallet vs `agreement.provider/client/courier`; fetch agreements with `memcmp` filters on each pubkey field.
**Step 5.3** — Agreement view: 3PL form (client, courier, timeout in hours); client "Accept terms" button.
**Step 5.4** — Order list + order detail: status timeline, prices in SOL, deadline countdown.
**Step 5.5** — Action buttons per role and status only (3PL: set prices / mark processed / send invoice / cancel; client: pay / cancel / refund; courier: confirm delivery). Invoice: hash an uploaded PDF in the browser (SHA-256), send the hash.
**Step 5.6** — every transaction shows a toast with a Solana Explorer devnet link; errors show the program's `#[msg]` text.

## Phase 6 — Docs & submission

**Step 6.1 — README**: repo map, how to run, output of `grep -rn ENFORCES programs/`, known limits.
**Step 6.2 — AGENTS.md**: rename `fulfillment` → `chaind_logistics` where it names the crate.

### Known limits (go in the README)
- The courier's delivery confirmation is trusted; there is no proof-of-delivery oracle.
- One agreement per (3PL, client) pair; the courier is fixed per agreement.
- If the 3PL never invoices, the courier can't confirm and the client refunds after the timeout.
- Near the deadline, courier confirm and client refund race; whichever lands first wins.
- The client can cancel after `Processed`, so the 3PL's pick/pack work is unpaid (off-chain risk).
- SOL only; price volatility is not handled.
