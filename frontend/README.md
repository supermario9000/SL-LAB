# Frontend: Trustless Order Fulfillment

A rough React UI for the `chaind_logistics` Solana escrow program. A 3PL, a client and a courier each
connect a wallet and click through one order, from creation to payout, with an Explorer link for every
transaction.

**New to this code? Start with [docs/GUIDE.md](docs/GUIDE.md).** It walks through every file,
maps each part to the Rust code it mirrors, and explains how it was tested.

> ⚠️ The program currently deployed at the repo's id (`D4Zu8f…`) was built for a different id and
> rejects every transaction. Redeploy it, or temporarily set
> `VITE_PROGRAM_ID=9un2SfWqP437NoikxbJDPbBQBYdsL99e1b75S2wMR262` in `frontend/.env`.
> See [docs/GUIDE.md §7](docs/GUIDE.md#7-backend-review-and-the-deployment-problem).

## Run

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

You need three browser-wallet accounts (Phantom, Solflare, Backpack…) on **devnet**, each with a little
test SOL from https://faucet.solana.com.

## After changing the program

```bash
# in the dev container, after `anchor build`:
cp chaind_logistics/target/idl/chaind_logistics.json frontend/src/idl/
grep -rn MIRRORS frontend/src     # every spot that copies something from the program
```

## Checks

```bash
npm run build        # type-check + production build
npx eslint src
```
