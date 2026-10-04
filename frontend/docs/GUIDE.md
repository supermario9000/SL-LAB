# Frontend guide

This is a walkthrough of the frontend, written for someone seeing the code for the first time.
Read it top to bottom once. After that, use [§4](#4-where-the-frontend-mirrors-the-program) whenever
the on-chain program changes.

Contents:
1. [What the UI does](#1-what-the-ui-does)
2. [How it is built (the big picture)](#2-how-it-is-built-the-big-picture)
3. [File by file](#3-file-by-file)
4. [Where the frontend mirrors the program](#4-where-the-frontend-mirrors-the-program)
5. [Updating the frontend after a program change](#5-updating-the-frontend-after-a-program-change)
6. [Demo script](#6-demo-script)
7. [Backend review and the deployment problem](#7-backend-review-and-the-deployment-problem)
8. [How this was tested](#8-how-this-was-tested)
9. [Changelog](#9-changelog)
10. [Known limits](#10-known-limits)

---

## 1. What the UI does

The UI follows `planning/flowchart.png` and talks to the Anchor program in `chaind_logistics/`.
There are three roles, and each wallet only sees the buttons that fit its role and the order's status:

| Step | Who clicks | Button in the UI | Program instruction |
|---|---|---|---|
| 1 | 3PL | "Create agreement" (client wallet, courier wallet, delivery deadline) | `init_agreement(courier, delivery_timeout)` |
| 2 | Client | "Accept terms" | `accept_agreement` |
| 3 | 3PL | "+ Register order" | `create_order(order_id)` |
| 4 | 3PL | "Set" fulfillment fee / shipping fee (either may be 0, not both) | `set_fulfillment_price`, `set_shipment_price` |
| 5 | 3PL | "Mark packed & ready for payment" (locks prices) | `mark_processed` |
| 6 | Client | "Pay X SOL into escrow" | `pay(expected_total)` |
| 7 | 3PL | "Issue invoice": the app builds the invoice from on-chain data; only its SHA-256 goes on-chain | `send_invoice(invoice_hash)` |
| 8 | Courier | "Confirm delivery: pay … to 3PL and … to courier" | `confirm_delivery` |
| before payment | 3PL or client | "Cancel order" | `cancel_order` |
| after the deadline | Client | "Claim full refund" | `refund_expired` |

The UI also shows things that help the demo's "the intermediary disappears" moment:
- **The order account's real SOL balance** (read straight from the chain), so you can see the escrow.
- **A blue banner** while money is in escrow, explaining that only delivery or the deadline can release it.
- **A refund countdown**, so the "what if someone disappears?" answer is visible.
- **A self-checking invoice**: anyone can open "View invoice". The app rebuilds it from on-chain data,
  checks it against the stored fingerprint, and can save it as a PDF.
- **A transaction log** with a Solana Explorer link for every transaction.

Rules from the program that shape the UI:
- **3PL, client and courier must be three different wallets** (`PartiesNotDistinct`). You need three
  wallets for a demo, and each wallet has exactly one role per agreement.
- **One agreement per (3PL, client) pair.** The courier is fixed per agreement.
- **The delivery deadline is between 1 second and 90 days.**
- **Every wallet that clicks pays its own transaction fee** (~0.000005 SOL), so all three wallets need
  a little devnet SOL. That includes the courier. (The repo's smoke script says "courier needs no SOL"
  only because the script's own wallet pays the fees.)

---

## 2. How it is built (the big picture)

Stack: **Vite + React 19 + TypeScript**, **Solana Wallet Adapter** for wallets, and the **Anchor TS
client** (`@coral-xyz/anchor`) to talk to the program.

```
            ┌───────────────────────── React components ─────────────────────────┐
            │ Header   AgreementPanel   OrderList   OrderDetail → Actions   TxLog │
            └──────┬────────────┬──────────────┬─────────────────┬───────────────┘
                   │ data       │ "which       │ send a tx       │ record + link
                   ▼            ▼  buttons?"   ▼                 ▼
        hooks/useChainData   lib/permissions   lib/contract ◄── hooks/useTx
          (poll every 10s)    (UI-only rules)   (THE adapter)
                   │                               │
                   └──────────── lib/contract ─────┤ uses lib/pda (addresses)
                                                   ▼
                     hooks/useProgram → Anchor Program (+ src/idl/chaind_logistics.json)
                                                   ▼
                                           Solana devnet RPC
```

Three ideas make the code easy to change later:

1. **One adapter file.** `src/lib/contract.ts` is the only file that knows instruction names,
   argument types, account names, and raw account fields. Components never call
   `program.methods...` themselves.
2. **UI types, not raw accounts.** The adapter converts raw Anchor accounts (with `BN` numbers and
   `{ paid: {} }` enums) into simple types from `src/lib/types.ts` (`bigint` lamports, `"Paid"` strings).
3. **The chain is the source of truth.** Nothing about orders is stored in the browser. Data is
   re-read every 10 seconds and right after each successful transaction.

---

## 3. File by file

Files are listed in the order you should read them.

### `src/main.tsx` and `src/polyfills.ts`
`main.tsx` is the entry point. Its first import is `polyfills.ts`, which adds Node's `Buffer` to the
browser. Solana libraries need it, and it has to load before any Solana code runs.

### `src/config.ts`
All settings in one place:
- `CLUSTER` / `RPC_URL`: devnet by default (`VITE_RPC_URL` in `.env` overrides it).
- `PROGRAM_ID`: the IDL's `address` (`D4Zu8f…`, same as `declare_id!` in `lib.rs`). `VITE_PROGRAM_ID` overrides it. See §7.
- `MIN_/MAX_DELIVERY_TIMEOUT_SECS`: copied from `constants.rs`, used to validate the agreement form.
- `REFRESH_MS`: how often to re-read the chain.

### `src/idl/chaind_logistics.json`
The IDL ("Interface Definition Language") is a JSON description of the program: its instructions,
their accounts and arguments, the account layouts, and the error messages. Anchor normally writes it to
`target/idl/chaind_logistics.json` during `anchor build`.

This copy was **transcribed from the Rust source**, because there's no Rust/Anchor toolchain outside the
dev container and the IDL isn't published on-chain. It isn't a guess: all 11 instruction discriminators
and both account discriminators were found inside the deployed binary, and the frontend ran the full flow
against that binary (§8). If you run `anchor build`, you can overwrite it with the generated file. The
generated file also has extras (docs, PDA seeds, events) that the UI doesn't need.

### `src/lib/types.ts`
The shapes the UI uses: `Agreement`, `Order`, `OrderStatus`, `Role`. Money is `bigint` lamports
(1 SOL = 1,000,000,000 lamports) so nothing gets rounded. `ORDER_STATUSES` lists the program's
`OrderStatus` variants in the same order.

### `src/lib/format.ts`
Small helpers with no Solana logic:
- `formatSol(lamports)` gives `"0.015 SOL"`; `parseSol("0.015")` gives lamports (exact, no floats).
- `shortAddress`, `explorerTx`, `explorerAddress` build `Abcd…wxyz` labels and Explorer links.
- `formatDate`, `formatDuration` for timestamps and the refund countdown.
- `sha256Hex(data)` computes a SHA-256 fingerprint in the browser.

### `src/lib/invoice.ts`
`buildInvoice(agreement, order)` builds the invoice from on-chain data only (parties, order, fees, paid
time), and `invoiceHash(invoice)` fingerprints it. The 3PL and the client run the same code, so they get
the same fingerprint. The format is versioned (`chaind-logistics-invoice/v1`): any change to the fields
changes every fingerprint, so add a v2 instead of editing v1.

### `src/lib/pda.ts`
PDAs (Program Derived Addresses) are account addresses computed from "seeds". This lets the UI work
out where an agreement or order lives without storing anything:
- `agreementPda(provider, client)` uses seeds `["agreement", provider, client]` (as in `init_agreement.rs`)
- `orderPda(agreement, orderId)` uses seeds `["order", agreement, order_id as 8-byte little-endian]` (as in `create_order.rs`)

### `src/lib/status.ts`
Business wording for each status (for example `Processed` shows as "Ready for payment"), the
happy-path order used by the timeline, and `isTerminal()`.

### `src/lib/permissions.ts`
Decides **which buttons to show**:
- `rolesFor(wallet, agreement)` returns `["provider"]`, `["client"]` or `["courier"]`.
- `allowedOrderActions(roles, agreement, order, now)` returns the actions to show.
- `refundAvailableAt(agreement, order)` returns `paid_at + delivery_timeout`.

This is **convenience only**. The program rejects the same actions on its own. Each condition copies
a rule from `state_machine.rs` (which status allows which action) or from an instruction's signer
check (which role may call it). For example, `mark_processed` is offered once the **total** is > 0,
because that's exactly what `mark_processed.rs` checks.

### `src/lib/contract.ts`: the adapter
The bridge between the UI and the program. It has four parts:
1. **Reading**: `fetchAgreements`, `fetchOrders`. They fetch all accounts of a type and filter in the
   browser. That's simple and fine at hackathon scale. `decodeAgreement` / `decodeOrder` turn raw accounts into UI types.
2. **Writing**: one function per instruction (`initAgreement`, `pay`, `confirmDelivery`, …). Each
   builds the call with `program.methods.<name>(args).accountsPartial({...}).rpc()` and returns the
   transaction signature. `accountsPartial` passes every account explicitly, so nothing relies on
   Anchor guessing accounts.
3. **Deployment check**: `checkDeployment(program)` makes sure a program exists at `PROGRAM_ID` **and**
   was built for that address. It simulates one harmless call (no signature, no fee, no wallet popup)
   and looks for `DeclaredProgramIdMismatch`. See §7 for why this exists.
4. **Errors**: `describeError(err)` turns wallet, RPC and program errors into one readable line:
   - program errors show the `#[msg("...")]` text from `error.rs`, e.g. "The delivery deadline has not passed yet"
   - wrong-wallet errors (Anchor's `has_one` constraint) show "Your wallet doesn't have the right role…"
   - "account already in use" shows "That account already exists… Refresh and try again"

Worth knowing: `pay` sends `expected_total = fulfillment + shipment` **as displayed to the client**.
If the price changed in the meantime, the program refuses (`TotalMismatch`) instead of charging a
different amount.

### `src/hooks/useProgram.ts`
Builds the Anchor `Program` object from the IDL plus the connected wallet, using `PROGRAM_ID` as the
address. Returns `null` when no wallet is connected.

### `src/hooks/useChainData.ts`
`useAgreements()` returns the agreements where the connected wallet is the 3PL, client or courier.
`useOrders(agreement)` returns that agreement's orders, newest first. Both re-poll every `REFRESH_MS`,
expose `refresh()` for after a transaction, and ignore stale responses when you switch agreements.

### `src/hooks/useTx.tsx`
A small React context that wraps every transaction:
`run("Pay 0.015 SOL into escrow", () => contract.pay(program, order))`.
It records pending, confirmed or failed, keeps the signature for the Explorer link, and returns
`true`/`false` so the caller knows whether to refresh. `pending` is used to disable all buttons
while a transaction is in flight.

### `src/App.tsx`
Sets up the providers (RPC connection, wallets, wallet modal, transaction log) and the layout.
`Dashboard` keeps track of the selected agreement and order. Selections are stored as address
strings and looked up in the freshly polled lists, so they always show current data. An empty
`wallets={[]}` list is intentional: modern wallets register themselves through the Wallet Standard.

### `src/components/`
| File | What it shows |
|---|---|
| `Header.tsx` | Title, program id link, wallet button, and a warning if the program is missing or built for the wrong id |
| `AgreementPanel.tsx` | Your agreements (role, parties, deadline), "Accept terms" for the client, and the "create agreement" form for a 3PL. The form checks the program's rules before sending (distinct wallets, one agreement per client, 1 s–90 day deadline in minutes/hours/days) |
| `OrderList.tsx` | The selected agreement's orders (id, status, total) and "+ Register order" for the 3PL |
| `OrderDetail.tsx` | Status timeline, fees, registered/paid times, escrow balance, refund countdown, invoice panel; it renders `Actions` |
| `Actions.tsx` | Only the buttons `permissions.ts` allows: price form, mark ready, pay, issue invoice (with preview), confirm delivery, refund, cancel |
| `Invoice.tsx` | The invoice document, and the panel that rebuilds it from chain data, shows ✓ when it matches the on-chain fingerprint, and prints it as a PDF |
| `TxLog.tsx` | Every transaction from this tab, with Explorer links |
| `Address.tsx` | A short address that links to Explorer, with "(you)" for your own wallet |

### Styles: `src/index.css`, `src/App.css`
`index.css` holds the color tokens (light and dark follow your OS) and base text. `App.css` holds the
layout and component classes. Plain on purpose.

---

## 4. Where the frontend mirrors the program

The round-1 `BACKEND-DEPENDENT` markers are all resolved (§9). Every spot that copies something from
the program is now tagged `// MIRRORS: <program file>`, so if the program changes you can find
everything to compare:

```bash
grep -rn MIRRORS frontend/src
```

Program files are in `chaind_logistics/programs/chaind_logistics/src/`.

| Frontend | Mirrors |
|---|---|
| `config.ts` `PROGRAM_ID` | `lib.rs` `declare_id!`, `Anchor.toml` |
| `config.ts` timeout bounds | `constants.rs` |
| `types.ts` `ORDER_STATUSES` | `state.rs` `OrderStatus` |
| `contract.ts` `RawAgreement` / `RawOrder` / `decodeOrder` | `state.rs` `Agreement` / `Order` |
| `contract.ts` write functions | `lib.rs` signatures + `instructions/<name>.rs` Accounts structs |
| `pda.ts` | seeds in `init_agreement.rs` and `create_order.rs` |
| `permissions.ts` | `state_machine.rs` `next()`, `mark_processed.rs`, `math.rs` `is_expired` |
| `status.ts` `HAPPY_PATH` | `state_machine.rs` |
| `idl/chaind_logistics.json` | everything above (regenerate with `anchor build`) |

Arguments and accounts per instruction, as the frontend sends them (TS uses camelCase, Rust uses snake_case):

| Instruction | Args | Accounts (✍ = signer, ✏ = writable) |
|---|---|---|
| `init_agreement` | `courier: Pubkey`, `delivery_timeout: i64` | provider ✍✏, client, agreement ✏, system_program |
| `accept_agreement` | none | client ✍, agreement ✏ |
| `create_order` | `order_id: u64` (must equal `agreement.next_order_id`) | provider ✍✏, agreement ✏, order ✏, system_program |
| `set_fulfillment_price` / `set_shipment_price` | `lamports: u64` | provider ✍, agreement, order ✏ |
| `mark_processed` | none | provider ✍, agreement, order ✏ |
| `pay` | `expected_total: u64` | client ✍✏, agreement, order ✏, system_program |
| `send_invoice` | `invoice_hash: [u8; 32]` | provider ✍, agreement, order ✏ |
| `confirm_delivery` | none | courier ✍✏, provider ✏, agreement, order ✏ |
| `cancel_order` | none | signer ✍, agreement, order ✏ |
| `refund_expired` | none | client ✍✏, agreement, order ✏ |

---

## 5. Updating the frontend after a program change

1. In the dev container: `anchor build`, then `cp target/idl/chaind_logistics.json frontend/src/idl/`.
2. `grep -rn MIRRORS frontend/src` and compare each spot with the changed Rust file (§4 table).
3. `cd frontend && npm run build && npx eslint src`. Type errors won't catch renamed instructions or
   fields, because the IDL is loosely typed, so step 2 matters.
4. Optional, for autocompletion: copy `target/types/chaind_logistics.ts` into `src/idl/` and use
   `Program<ChaindLogistics>` in `useProgram.ts`.

About the Anchor version: the program and its tests use Anchor 1.1.2 (`@anchor-lang/core`). This frontend
uses `@coral-xyz/anchor` 0.32, which reads the same IDL format. That was verified against the deployed binary (§8).

---

## 6. Demo script

Prepare **three** devnet wallets (3PL, client, courier). Fund each one with a little SOL from
https://faucet.solana.com (the 3PL also pays ~0.002 SOL rent per agreement and per order; the client pays
the order total). Use three browser profiles, or switch accounts in the wallet.

1. **3PL**: connect, open "I'm a 3PL: create a new agreement", paste the client and courier addresses,
   and set a short deadline for the demo (for example `3` `minutes`). Create.
2. **Client**: connect, click "Accept terms".
3. **3PL**: "+ Register order", set both fees, then "Mark packed & ready for payment".
4. **Client**: "Pay X SOL into escrow". Show the order account balance and open the transaction on Explorer.
5. **3PL**: preview the invoice, then "Issue invoice". **Client**: "View invoice" shows ✓ and "Download PDF".
6. **Courier**: "Confirm delivery". On Explorer, show that one transaction paid both the 3PL and the courier.
7. *Alternative ending*: skip step 6, wait for the deadline, then as the client click "Claim full refund".

**Before the demo, check that the header shows no warning** after connecting a wallet. See §7.

---

## 7. Backend review and the deployment problem

### ⚠️ The deployment at the repo's program id doesn't work

| Program id | Deployed (UTC) | Built for id | Works? |
|---|---|---|---|
| `D4Zu8fGYGib6G18fu9XmMbDDrQB8hFQd7ge1MUax1Pna` (in `lib.rs`, `Anchor.toml`, the IDL) | 2026-10-04 01:00 | `9un2Sf…` | **No**: every instruction fails with `DeclaredProgramIdMismatch` (Anchor error 4100) |
| `9un2SfWqP437NoikxbJDPbBQBYdsL99e1b75S2wMR262` | 2026-10-04 00:30 | `9un2Sf…` | **Yes**: passes the full frontend test (§8) |

The two binaries are byte-identical. It looks like the program was built while `declare_id!` was
`9un2Sf…` (commit `cf94010` set that id in `Anchor.toml`), then the id was switched back to `D4Zu8f…`
(`48a0956`) and the **same old build** was deployed there without rebuilding. Neither deployment has an
IDL published on-chain.

**Fix (pick one):**
- **Redeploy (recommended):** in the dev container, make sure `declare_id!`, `Anchor.toml` and
  `target/deploy/chaind_logistics-keypair.json` agree on `D4Zu8f…` (`anchor keys sync`), then
  **`anchor build` again**, then `anchor deploy --provider.cluster devnet`. No frontend change needed.
  Optionally also run `anchor idl init` so Explorer can decode your instructions.
- **Use the working deployment now:** create `frontend/.env` with
  `VITE_PROGRAM_ID=9un2SfWqP437NoikxbJDPbBQBYdsL99e1b75S2wMR262`. Remember to remove it after redeploying.

The header detects this situation and shows a warning, so it can't silently break a live demo.

### Program review: other findings
The program logic itself looks solid. The state machine is the only writer of `status`, every money
move is behind a status check and a `has_one` signer check, the math is checked, and every order can
reach a terminal state. Smaller things worth knowing:

1. **`mark_processed` checks the total, not each price.** The comment says "both prices must be set"
   and the error says "Set the fulfillment and shipment prices first", but the code only requires
   `fulfillment + shipment > 0`, so one fee may be 0. The frontend follows the code. Either fix the
   comment and message, or require both > 0.
2. **`chaind_logistics/README.md` says the UI is in `app/` ("not yet scaffolded").** It's in `frontend/`.
3. **No IDL on-chain** (see above). Explorer shows raw bytes instead of decoded instructions.
4. **The smoke test's "courier needs no SOL"** is only true because the script's wallet pays fees. In
   the UI each party pays its own fee.
5. **`cancel_order`'s `agreement` has no `seeds` constraint.** That's safe, because `Account<Agreement>`
   checks the owner and discriminator, and `has_one = agreement` ties the order to it. Mentioned only for
   consistency with the other instructions.

---

## 8. How this was tested

- `npm run build` (type-check + production build) and `npx eslint src` pass.
- The built page renders in headless Chrome with no errors.
- **IDL vs the deployed binary:** all 11 instruction discriminators and both account discriminators
  were found in the program downloaded from devnet.
- **End-to-end against the deployed binary:** the devnet faucet was rate-limited, so the deployed
  program was downloaded from devnet and run locally in [LiteSVM](https://github.com/LiteSVM/litesvm)
  (an in-process Solana VM). The **real frontend code** (`contract.ts`, `permissions.ts`, `pda.ts`,
  `format.ts`, through Vite and the browser build of Anchor) then drove three wallets through:
  - the happy path: agreement → accept → order → prices → ready → pay → invoice → confirm, with exact
    payouts (3PL +0.002 SOL, courier +0.001 SOL minus its fee)
  - a refund with the clock moved: rejected at deadline − 1 s, accepted exactly at the deadline
  - a cancel by the client, and the courier being refused
  - 15 rejections (wrong role, wrong status, wrong total, bad timeout, duplicate agreement, stale order id…),
    each showing the expected readable message
  - which buttons `permissions.ts` shows at each step

  All 47 checks pass for `9un2Sf…`. The same run against `D4Zu8f…` fails on the first instruction with
  `DeclaredProgramIdMismatch`, which is how the deployment problem was found.
- `checkDeployment()` was run against real devnet: `D4Zu8f…` → `wrong-build`, `9un2Sf…` → `ok`.
- **Not tested:** clicking through the UI with real browser wallets on devnet.

---

## 9. Changelog

All changes are inside `frontend/`.

### Round 2: connected to the real program (`chaind_logistics`)
| File | Change |
|---|---|
| `src/idl/fulfillment.json` → `src/idl/chaind_logistics.json` | Placeholder replaced with the real program's IDL (transcribed from source, checked against the binary), including error messages |
| `src/config.ts` | Program id now comes from the real IDL (`D4Zu8f…`); placeholder flag removed; timeout bounds added |
| `src/lib/contract.ts` | `init_agreement` now takes `(courier, timeout)` and no courier account; `cancel_order` signer is `signer`; `order_count` → `next_order_id`; decodes `created_at`; new `checkDeployment()`; `describeError` reads logs and maps wrong-role / already-exists errors |
| `src/lib/types.ts` | `orderCount` → `nextOrderId`; added `createdAt` |
| `src/lib/permissions.ts` | "Mark ready" needs total > 0 (not both fees), as the program does |
| `src/components/AgreementPanel.tsx` | Form checks distinct wallets, duplicate agreements and the 1 s–90 day range; deadline in minutes/hours/days |
| `src/components/Actions.tsx` | A fee of 0 is allowed; hint when both are 0 |
| `src/components/OrderDetail.tsx` | Shows the registration time |
| `src/components/Header.tsx` | Placeholder banner replaced by the missing-program / wrong-build warning |
| `src/lib/pda.ts`, `status.ts`, `hooks/useProgram.ts` | `BACKEND-DEPENDENT` markers turned into `MIRRORS` notes (no logic change) |
| `src/App.css` | Styles for `<select>` |
| `docs/GUIDE.md`, `README.md` | Updated |

### Round 1: first version against a placeholder
Rewrote the broken Solana stubs (`App.tsx`, `Actions.tsx`, `OrderList.tsx`, `useProgram.ts`, `pda.ts`),
filled in `OrderDetail.tsx`, and added `config.ts`, `polyfills.ts`, `lib/*`, `hooks/useChainData.ts`,
`hooks/useTx.tsx`, `Header`, `AgreementPanel`, `TxLog`, `Address`, new styles, `.env.example` and the docs.

**Not touched:** `src/App_example.jsx`, `src/OrderFulfillmentAbi.js`, `src/OrderFulfillmentArtifact.js`
(the old Ethereum version, which nothing imports). No npm packages were added.

---

## 10. Known limits

- Fetching all accounts and filtering in the browser is fine for a demo but won't scale. With more
  accounts, switch to `memcmp` filters (the layout is now final).
- Data refreshes by polling (every 10 s and after each transaction), not by event subscriptions.
- If two orders are registered under one agreement at the same moment, the second fails ("already
  exists"). Refreshing and retrying fixes it.
- The delivery confirmation is trusted: whatever the courier signs counts as delivered (a program-level limit).
- The invoice only contains on-chain data (wallet addresses, not company names, addresses or VAT codes).
  Orders invoiced with an uploaded file before this change can only be checked with that file.
- The JS bundle is large (~880 kB) because of the Solana libraries. That's fine for a demo.
