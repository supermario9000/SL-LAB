# Frontend: Trustless Order Fulfillment

**Devnet only. This is a proof of concept.** A rough React UI for the `chaind_logistics` Solana escrow program. A 3PL, a client and a courier each
connect a wallet and click through one order, from creation to payout, with an Explorer link for every
transaction.

**New to this code? Start with [docs/GUIDE.md](docs/GUIDE.md).** It walks through every file,
maps each part to the Rust code it mirrors, and explains how it was tested.

Program id: `9un2SfWqP437NoikxbJDPbBQBYdsL99e1b75S2wMR262` (devnet), the same as `declare_id!` in
`chaind_logistics/programs/chaind_logistics/src/lib.rs`.

The app checks at startup that its RPC is Solana devnet (by genesis hash) and refuses to run on any
other network. `VITE_RPC_URL` may only point at another devnet endpoint.

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
