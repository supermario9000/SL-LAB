# Frontend: Trustless Order Fulfillment

A rough React UI for the Solana escrow program. A 3PL, a client and a courier each connect a wallet
and click through one order, from creation to payout, with an Explorer link for every transaction.

**New to this code? Start with [docs/GUIDE.md](docs/GUIDE.md).** It walks through every file and
lists every place that depends on how the on-chain program is written.

## Run

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

You need a browser wallet (Phantom, Solflare, Backpack…) switched to **devnet**, with test SOL from
https://faucet.solana.com.

## Hook up the real program

```bash
# after `anchor build` in the program workspace:
cp <program-workspace>/target/idl/fulfillment.json frontend/src/idl/fulfillment.json
```

Then go through every marker:

```bash
grep -rn BACKEND-DEPENDENT frontend/src
```

## Checks

```bash
npm run build        # type-check + production build
npx eslint src
```
