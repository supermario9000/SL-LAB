# Roadmap — Trustless Crypto Checkout for Physical Goods

Target: Superteam Poland's **"Finance Without Intermediaries"** challenge at HackYeah.
Team: SL Lab (Vilnius University). Build window per [`rules.md`](./rules.md): **2026-10-03 23:00 → 2026-10-04 23:00** (24h, no edits accepted after the deadline).

## 1. The one-liner

A buyer pays **crypto into an on-chain escrow** to buy a physical product. The escrow — not a payment processor, not the seller, not us — holds the funds and releases them automatically, split between the **3PL/seller** and the **courier**, the moment the buyer confirms delivery on-chain. If either side disappears, a time-locked fallback lets the other recover the funds. No company ever custodies the money or decides who gets paid.

This directly follows [`flowchart.png`](./flowchart.png): Client ↔ 3PL ↔ Smart Contract ↔ Courier, with the smart contract as the only party both sides have to rely on.

## 2. What's actually being graded (from `criteria.md` + `rules.md`)

| Criterion | Weight | What this means for us |
|---|---|---|
| Relevance to the challenge | 30% | The escrow logic must be **on-chain**, not backend-enforced ("if your backend enforces the terms, the intermediary has not disappeared; it has become you"). |
| Completeness & functionality | 25% | One full flow, start to finish, live, with a confirmed tx shown on Solana Explorer. Rough UI is fine; broken flow is not. |
| Idea & choice of problem | 20% | Our pitch: logistics providers as **first-class on-chain actors** (not hidden behind a backend API) is the differentiator. |
| Implementation potential | 15% | Have a credible "what's next" answer ready (§8). |
| Originality | 10% | Lead with the logistics-integration angle — most escrow demos stop at buyer↔seller; we add the courier as a paid, on-chain party. |

Phase 1 is mentor review on HackTribe (need ≥50% to advance); Phase 2 is a live pitch for finalists. Submission must include: title, team name, team roster (1–6), description + **design rationale**, a ≤10-slide PDF, a ≤3-minute publicly hosted video, and a code repo (criteria.md requires the repo and video even though `rules.md`'s general T&Cs list them as optional — treat both as required).

## 3. Decisions to lock in the first 30 minutes

- [ ] **Target user** (criteria.md requires we name one explicitly — shapes all interface copy). Recommended: *"independent online sellers who ship physical goods directly to buyers, and the couriers who deliver for them — both of whom today depend on a centralized marketplace or payment processor (Stripe/Allegro/Etsy-style escrow) to hold the buyer's money and eventually release it."* Buyer-facing UI should stay plain-language; seller/courier dashboards can show wallet addresses and Explorer links since those are business operators.
- [ ] **Payment rail**: native devnet SOL for the vault (simplest, zero ATA/mint setup, and criteria.md explicitly sanctions faucet SOL). SPL Token (a mock devnet USDC mint) is a stretch goal only if §6 finishes early — it's listed in criteria.md as a "ready-made building block" worth citing for the Originality/Idea score.
- [ ] **Delivery confirmation signer**: buyer confirms receipt (see §4) — simplest trust story and the one a judge can't poke a hole in without us having an answer ready.
- [ ] Team roster + project title for the HackTribe submission form.

## 4. On-chain program design (Anchor)

**State machine** per order: `Created → Paid → Processed → Shipped → Delivered/Closed`, with an escape hatch to `Refunded` from any pre-`Delivered` state once a deadline passes.

**Accounts**

| Account | Seeds | Holds |
|---|---|---|
| `Config` | `["config"]` | admin pubkey (listing/pause rights only — **never** fund custody) |
| `Provider` | `["provider", authority]` | 3PL identity, active flag |
| `Courier` | `["courier", authority]` | courier identity, flat shipping rate, active flag |
| `Listing` | `["listing", provider, sku]` | price, stock, active flag |
| `Order` | `["order", buyer, order_seed]` | buyer, provider, courier, listing, amounts, status, timestamps, `delivery_deadline` — **the vault is the order account's own lamports**, no separate token account needed for the SOL-native MVP |

**Instructions** (build in this order — each is a demo checkpoint):

1. `initialize_config` — once, by admin.
2. `register_provider` / `register_courier` — self-registration, no admin gate.
3. `create_listing` — provider sets price + stock.
4. `place_order` — buyer picks listing + courier, Order PDA created in `Created`, computes `total = goods + shipping`.
5. `pay_order` — buyer transfers `total` lamports into the Order PDA; status → `Paid`; sets `delivery_deadline = now + N`. **This is "Safe payment" in the flowchart.**
6. `mark_processed` — provider signs (pick/pack/sort simulated). Status → `Processed`.
7. `mark_shipped(tracking_ref)` — provider or courier signs. Status → `Shipped`. Collapses the flowchart's "order the shipment" + "tracking information" into one call — the real courier-API integration is out of scope for 24h and should be named explicitly as a stub in the demo and README.
8. `confirm_delivery` — **buyer** signs. Atomically splits the vault: pays `provider` the goods amount, pays `courier` the shipping amount, status → `Closed`. One atomic instruction = the two flowchart payouts + close-order step, and proves it's impossible to pay one party without the other.
9. `claim_refund` — buyer signs, only if status is pre-`Delivered` **and** `now > delivery_deadline`. Returns the full vault to the buyer.
10. `release_after_timeout` — provider or courier signs, only if status is `Shipped` **and** `now > delivery_deadline` (i.e., buyer went silent after the goods shipped). Pays out exactly like `confirm_delivery`. Mirrors real-world "buyer protection window auto-closes" logic.

**Permissions model (prep this answer — judges will ask):** the `Config` admin key can only pause new registrations; it is never a signer on any instruction that moves money out of an `Order`'s vault. Only `confirm_delivery` (buyer-gated) and `claim_refund` / `release_after_timeout` (time-gated) touch escrowed funds. Fund disposition is fully determined by on-chain state + the `Clock` sysvar, not by us.

**"What happens if a party disappears?"** — covered symmetrically: buyer disappears post-shipment → `release_after_timeout` protects provider+courier; provider/courier disappear pre-shipment → `claim_refund` protects the buyer. Funds are never permanently stuck.

## 5. Scope cut — what's real vs. simulated

Be explicit about this in the README and the demo narration; criteria.md rewards honesty about limitations over pretending everything is production-grade.

| Flowchart step | Hackathon treatment |
|---|---|
| Client sends product stock to 3PL | Seed script / simple form — off-chain |
| 3PL "deploys", owns | On-chain `register_provider` |
| Courier pricelist | On-chain `register_courier` rate (real differentiator — keep this on-chain even under time pressure) |
| Register order, stock/price check | On-chain `place_order` |
| Order status events | Anchor event emissions + UI polling |
| Pick/pack/sort, processed | On-chain `mark_processed` (simulated warehouse step) |
| **Safe payment** | **On-chain `pay_order` — core of the demo** |
| Order the shipment / tracking | Stubbed inside `mark_shipped`; real courier API integration named as future work |
| Invoice | Off-chain, generated client-side — not core to the trust story |
| Delivery OK → payouts → close | **On-chain `confirm_delivery` — core of the demo** |

## 6. 24-hour timeline

Elapsed time from kickoff (anchor to 2026-10-03 23:00 if that's the actual start; shift the whole table if not). Adjust for team size — these blocks assume 1–3 people; with more, parallelize program vs. frontend vs. slides/video from T+2:00.

| Window | Focus | Checkpoint |
|---|---|---|
| T+0:00–0:30 | Lock §3 decisions, scaffold repo (`programs/`, `app/`, `tests/`), first commit | Decisions written down, not re-litigated later |
| T+0:30–2:00 | Anchor skeleton: structs, PDAs, empty instructions, `anchor build` green, devnet deploy wired up | A trivial instruction (`initialize_config`) deploys and is callable — kills toolchain risk early |
| T+2:00–6:00 | Implement `register_provider/courier`, `create_listing`, `place_order`, `pay_order` + tests | Buyer can place + pay for an order via a test script, no UI yet |
| T+6:00–9:00 | Implement `mark_processed`, `mark_shipped`, `confirm_delivery`, `claim_refund`/`release_after_timeout` + tests | Full happy path **and** one failure/refund path pass on devnet |
| T+9:00–9:30 | Break / sleep rotation if team > 1 | — |
| T+9:30–14:00 | Frontend: wallet connect, buyer storefront + order status + "Confirm Delivery", provider dashboard, courier dashboard. Keep it plain — criteria.md explicitly prefers "simple and working" over polished. | Every on-chain action reachable by click, not just CLI |
| T+14:00–17:00 | Wire frontend to real devnet program, Explorer links on every tx, seed demo data (one provider, one courier, one listing) | No mocked calls left in the demo path |
| T+17:00–19:00 | Full dry-run with two funded devnet wallets, exactly as judges will see it; record a backup video take now as insurance against a live faucet/RPC outage | Two clean end-to-end runs |
| T+19:00–21:00 | Write README (what's where, build/run steps, which file is the intermediary-removal logic) + design rationale + ≤10-slide PDF | Submission text drafted |
| T+21:00–22:30 | Finalize/upload the ≤3-minute video, proofread everything | Public link works in a private browser tab |
| T+22:30–23:00 | Submit on HackTribe with buffer for upload issues | **Submitted before 23:00 — no edits accepted after** |

## 7. Submission checklist

- [ ] Project title
- [ ] Team name + roster (1–6 members)
- [ ] Description incl. design rationale: which relationship we redesigned, who the intermediary was, what changes when it's removed
- [ ] PDF presentation, ≤10 slides
- [ ] Video, ≤3 minutes, public link
- [ ] Public code repo with a clear README
- [ ] Devnet wallets funded in advance for the live demo; two wallets if the scenario needs both a buyer and a provider/courier operator
- [ ] Block explorer tab ready (Solana Explorer or Solscan)
- [ ] Backup recording in case of faucet/RPC failure during the live slot

## 8. Answers to have ready (judges ask these every time)

- **Where does the intermediary disappear?** `confirm_delivery` and `pay_order` in the Anchor program — escrowed funds move only by buyer signature or by a Clock-gated timeout, never by an admin call.
- **What if a party disappears mid-transaction?** §4's symmetric timeout paths (`claim_refund`, `release_after_timeout`).
- **Who can change what after deployment?** Admin can only pause new registrations; no instruction lets us touch an order's escrowed lamports.
- **Why blockchain, not a database?** The vault isn't held in anyone's bank account — not the buyer's, not the seller's, not ours; the split payout to two parties happens atomically in one instruction, so it's structurally impossible to pay one side and not the other; and the whole thing settles in under a second for a fraction of a cent, which is what makes escrowing even a small-ticket purchase economical.
- **What would you do with another week?** Real courier API integration behind `mark_shipped`; swap self-attested delivery for a dispute window or proof-of-delivery oracle; SPL Token (USDC) settlement instead of SOL to remove price volatility; provider/courier reputation accrual on-chain.
