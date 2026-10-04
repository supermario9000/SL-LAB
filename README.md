# Chaind Logistics

The chronicles of SL lab - the mightiest Lithuanian team from Vilnius University.

Currently at: HackYeah.pl

Devcontainer environment for the Superteam Poland Solana Bootcamp.

## How to run demo
NOTE: Smart contract functionality is already deployed to devnet, there is no need to do it yourself.

### Install dependencies
Install npm and docker.

### Install crypto wallet extension
Install a crypto wallet extension on your browser. The wallet must support devnet (our team used Solflare for development). Set wallet network to devnet.

### Add 3 crypto wallets
Add 3 cryptowallets (1 for each party). There needs to be a 3PL, client and courier wallets. This action can be done on 3 different machines, does not matter.

### Fund the crypto wallets
Fund the crypto wallets via faucets, so that they can participate in transactions.

### Launch frontend
Launch frontend with the command:
```bash
cd frontend
npm install
npm run dev
```

### Open website
Open demo website on localhost. And log in with 3PL wallet.

### Create an agreement
Open demo website on localhost. Log in with the 3PL wallet and create an agreement by entering client and courier waller addresses.

### Accept the agreement
Log in with the client wallet and accept the agreement.

### Create an order
With the 3PL wallet create an order. Then set 3PL and courier payouts and mark it as processed.

### Pay SOL to escrow
With the client wallet pay to the escrow.

### Send invoice
With the 3PL wallet issue the generated invoice.

### Confirm order as delivered
With the courier wallet confirm the order as delivered so all the funds get paid.

## Developing the smart contract functionality

### VS Code
1. Open this repository in VS Code.
2. When prompted, click **Reopen in Container** (or run `Dev Containers: Reopen in Container` from the Command Palette).
3. The devcontainer includes the full pre-installed Solana toolchain:
   - **Node.js**: 24+
   - **Rust**: 1.95.0
   - **Anchor**: 1.1.2
   - **Surfpool**: local validator
   - **zsh**: configured with autosuggestions and syntax highlighting

### Terminal
```bash
sudo docker build -t chaind_logistics-image .
sudo docker run --rm --interactive --tty --name chaind_logistics-container -v "$(pwd)/chaind_logistics/":/workspace -w /workspace chaind_logistics-image
```
