# AGENTS.md — Trustless 3PL Order Fulfillment on Solana

An Anchor (Rust) program on Solana devnet that escrows a client's payment for a 3PL order and pays out the 3PL and the courier when delivery is confirmed, with no intermediary. It comes with a TypeScript/React UI. `Planning/flowchart.png` is the source of truth for the flow; `Planning/` is read-only.

## Hard rules
- All trust logic lives in the program: statuses, roles, prices, payments, payouts, refunds. The UI may hide actions, but the program must still reject them.
- No admin path: nobody, the deployer included, can move escrowed funds or change accepted terms.
- Every order can reach a terminal state (`Closed`/`Cancelled`/`Refunded`) even if a party disappears.
- Mark each line that enforces a rule with `// ENFORCES: <rule>` so `grep -rn ENFORCES programs/` lists them all.

## Flow (flowchart → instructions)
Off-chain, not in the program: stock, pick/pack, courier pricelist, tracking.

| Instruction | Caller | Effect |
|---|---|---|
| `init_agreement` | 3PL | Sets client, courier and delivery timeout |
| `accept_agreement` | Client | Terms now bind |
| `create_order` | 3PL | Status `Created` |
| `set_fulfillment_price`, `set_shipment_price` | 3PL | Allowed only while `Created` |
| `mark_processed` | 3PL | `Processed`; prices are locked from here |
| `pay(expected_total)` | Client | Exact total moves into escrow on the Order PDA; `Paid` |
| `send_invoice(sha256)` | 3PL | `Invoiced` |
| `confirm_delivery` | Courier | Atomically pays the fulfillment fee to the 3PL and the shipment fee to the courier; `Closed` |
| `cancel_order` | 3PL or client | Before payment only |
| `refund_expired` | Client | Full refund once `paid_at + timeout` has passed |

PDAs: `["agreement", provider, client]` and `["order", agreement, order_id_le]`. Payments are in SOL lamports only (SPL tokens are out of scope unless asked).

## Code layout
- `programs/chaind_logistics/src/`:
  - `lib.rs` only dispatches to `instructions/<name>.rs` (an Accounts struct plus `handle_<name>`), as in the course examples.
  - `state.rs` uses fixed-size fields only and new fields are appended, never reordered.
  - `state_machine.rs` and `math.rs` hold the pure, unit-tested logic.
  - Also `error.rs` and `events.rs`.
- `tests/chaind_logistics.ts` holds the integration tests.
- `app/` is Vite + React + `@anchor-lang/core` + Solana Wallet Adapter, with the IDL synced into `app/src/idl/`.
- `scripts/` holds `sync-idl.sh` and `seed-demo.ts`.

## Coding rules
- Structural checks go in Anchor constraints (`seeds`/`bump`/`has_one`/`Signer`). Business rules go through `state_machine.rs`; never assign a status directly.
- No `unwrap`/`expect`/`panic!` in instruction paths. Use checked math, and `require!` with a specific error.
- Order of work: validate, mutate state, then transfer.
- Error enum variants are append-only (Anchor numbers them by position), and each has a user-readable `#[msg]`.
- Emit one event per state change, but account state is the source of truth for the UI.
- The UI shows only the actions allowed for the connected wallet's role, uses business wording and SOL amounts, and gives an explorer link for every transaction.

## Environment & commands
Use the dev container from github.com/matzayonc/solana-live-course-2026 (Anchor 1.1.2, Rust 1.95.0, Surfpool, Node 24). Pin `rust-toolchain.toml` to 1.95.0.
```bash
anchor build && anchor keys sync       # keys sync only once
cargo test -p chaind_logistics && anchor test
anchor deploy --provider.cluster devnet
```
Before finishing any change, `cargo fmt --check && cargo clippy && cargo test -p chaind_logistics && anchor test` must pass.

## Agent rules
- Interface changes update the program, the tests and the synced IDL together.
- Never commit keypairs. `target/deploy/chaind_logistics-keypair.json` is the program id, so back it up.
- Ask the user before any irreversible action: `set-upgrade-authority --final`, `program close`, deploying under a new program id, or pushing.
- Keep `README.md` current: repo map, how to run, the `ENFORCES` list, and known limits (e.g. the courier's delivery confirmation is trusted).
