# Logictics

A trustless escrow between a 3PL (`provider`), its `client`, and a `courier`,
on Solana devnet. The client's payment is held in escrow by the program and
released to the 3PL and the courier only when the courier confirms delivery —
no intermediary holds or moves the funds. See `AGENTS.md` for the full design
rationale and `../PLAN.md` for the implementation plan this was built from.

## Repo map

```
logictics/
  programs/logictics/src/
    lib.rs              # #[program] module; only dispatches to instructions/<name>.rs
    constants.rs         # PDA seeds, delivery timeout bounds
    state.rs              # Agreement, Order, OrderStatus — fixed-size, append-only fields
    state_machine.rs      # next()/apply() — the only place order.status is written
    math.rs                # checked total/deadline/is_expired, unit-tested
    error.rs                # ErrorCode, one #[msg] per variant
    events.rs                # one event per state change
    instructions/             # one file per instruction: Accounts struct + handle_<name>
  tests/logictics.ts    # integration tests (Anchor + mocha/chai)
  app/                   # Vite + React + Wallet Adapter UI (not yet scaffolded)
  scripts/               # sync-idl.sh, seed-demo.ts (not yet added)
```

## How to run

Inside the project's dev container (Anchor 1.1.2, Rust 1.95.0, Surfpool, Node 24 —
see `../Dockerfile` / `../.devcontainer`):

```bash
cd logictics
anchor build && anchor keys sync   # keys sync only once
cargo fmt --check && cargo clippy && cargo test -p logictics && anchor test
```

`cargo test -p logictics` runs the pure-logic unit tests in `state_machine.rs`
and `math.rs` and needs no validator. `anchor test` additionally builds the
on-chain program, boots a local validator, and runs every integration test in
`tests/logictics.ts` against it.

> This environment had no Anchor/Solana CLI or local validator available, so
> only `cargo fmt`, `cargo clippy` and `cargo test -p logictics` were run here
> (all green). `anchor test` needs to be run in the dev container above to
> exercise the integration suite end to end.

## Enforcement points (`grep -rn ENFORCES programs/`)

```
instructions/mark_processed.rs:23:    // ENFORCES: both prices must be set before work can be marked processed
instructions/set_fulfillment_price.rs:25:    // ENFORCES: prices can only change while the order is still `Created`
instructions/set_fulfillment_price.rs:29:    // ENFORCES: the total must fit in u64 before the order can ever be paid
instructions/refund_expired.rs:26:    // ENFORCES: the client can only reclaim escrow once the delivery deadline has passed
instructions/pay.rs:26:    // ENFORCES: the client pays exactly the order's total, no more, no less
instructions/send_invoice.rs:21:    // ENFORCES: an invoice can only be sent once the order is paid
instructions/init_agreement.rs:32:    // ENFORCES: funds can never be locked in escrow for longer than 90 days
instructions/init_agreement.rs:41:    // ENFORCES: 3PL, client and courier must be three different wallets
instructions/confirm_delivery.rs:24:    // ENFORCES: delivery can only be confirmed once the order is invoiced
instructions/confirm_delivery.rs:37:    // ENFORCES: escrow pays the 3PL's fulfillment fee and the courier's
instructions/cancel_order.rs:22:    // ENFORCES: only the 3PL or the client can cancel an order
instructions/cancel_order.rs:29:    // ENFORCES: an order can only be cancelled before payment
instructions/accept_agreement.rs:22:    // ENFORCES: an agreement can only be accepted once
instructions/set_shipment_price.rs:22:    // ENFORCES: prices can only change while the order is still `Created`
instructions/set_shipment_price.rs:26:    // ENFORCES: the total must fit in u64 before the order can ever be paid
instructions/create_order.rs:31:    // ENFORCES: terms must bind before any order can be created
instructions/create_order.rs:33:    // ENFORCES: order ids are sequential per agreement
instructions/create_order.rs:47:    // ENFORCES: next_order_id never silently wraps
```

## Known limits

- The courier's delivery confirmation is trusted; there is no proof-of-delivery oracle.
- One agreement per (3PL, client) pair; the courier is fixed per agreement.
- If the 3PL never invoices, the courier can't confirm and the client refunds after the timeout.
- Near the deadline, courier confirm and client refund race; whichever lands first wins.
- The client can cancel after `Processed`, so the 3PL's pick/pack work is unpaid (off-chain risk).
- SOL only; price volatility is not handled.
- No admin path: nobody, including the deployer, can move escrowed funds or edit accepted terms.
- Accounts are never closed, so each Agreement/Order keeps ~0.002 SOL locked in rent permanently.
