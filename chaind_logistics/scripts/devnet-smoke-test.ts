/**
 * Meaningful devnet smoke test for the chaind_logistics program.
 *
 * Unlike a plain SOL transfer, this exercises the *actual deployed program*:
 * it runs the full agreement -> order -> Closed flow with three real devnet
 * wallets (provider, client, courier), submitting every instruction as a
 * real transaction and printing an Explorer link for each one.
 *
 * Funds the provider/client wallets by transferring SOL from your own
 * configured wallet (~/.config/solana/id.json) instead of requesting
 * airdrops, since the public devnet faucet is commonly rate-limited.
 *
 * Prerequisites:
 *   - `anchor build` has run (target/idl/chaind_logistics.json exists)
 *   - the program is already deployed on devnet (`anchor deploy --provider.cluster devnet`)
 *   - ~/.config/solana/id.json has at least ~0.03 SOL on devnet
 *
 * Run with:
 *   npx ts-node scripts/devnet-smoke-test.ts
 *   # or: tsx scripts/devnet-smoke-test.ts
 */
import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ChaindLogistics } from "../target/types/chaind_logistics";

const { Connection, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } =
  anchor.web3;

const DEVNET_URL = "https://api.devnet.solana.com";
const EXPLORER = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

// Lamports — deliberately tiny so the whole run costs a fraction of a cent.
const FULFILLMENT_PRICE = 2_000_000; // 0.002 SOL
const SHIPMENT_PRICE = 1_000_000; // 0.001 SOL
const TOTAL = FULFILLMENT_PRICE + SHIPMENT_PRICE;
const DELIVERY_TIMEOUT_SECONDS = 3600;

const FUND_PROVIDER_LAMPORTS = 0.01 * LAMPORTS_PER_SOL;
const FUND_CLIENT_LAMPORTS = 0.01 * LAMPORTS_PER_SOL;

function loadDefaultWallet(): InstanceType<typeof Keypair> {
  const keypairPath = path.join(os.homedir(), ".config/solana/id.json");
  const secret = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function logTx(label: string, sig: string) {
  console.log(`  [${label}] ${sig}`);
  console.log(`    -> ${EXPLORER(sig)}`);
}

async function main() {
  const connection = new Connection(DEVNET_URL, "confirmed");
  const payer = loadDefaultWallet();
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  console.log(`Funding wallet: ${payer.publicKey.toBase58()}`);
  const payerBalance = await connection.getBalance(payer.publicKey);
  console.log(`  balance: ${payerBalance / LAMPORTS_PER_SOL} SOL`);
  const required = FUND_PROVIDER_LAMPORTS + FUND_CLIENT_LAMPORTS + 50_000;
  if (payerBalance < required) {
    throw new Error(
      `Need at least ${required / LAMPORTS_PER_SOL} SOL on devnet in ` +
        `~/.config/solana/id.json, found ${payerBalance / LAMPORTS_PER_SOL}.`
    );
  }

  const program = anchor.workspace.chaindLogistics as Program<ChaindLogistics>;
  console.log(`Program id: ${program.programId.toBase58()}`);

  const providerKp = Keypair.generate();
  const clientKp = Keypair.generate();
  const courierKp = Keypair.generate();
  console.log("\nParties:");
  console.log(`  provider: ${providerKp.publicKey.toBase58()}`);
  console.log(`  client:   ${clientKp.publicKey.toBase58()}`);
  console.log(`  courier:  ${courierKp.publicKey.toBase58()} (needs no SOL)`);

  console.log("\nFunding provider and client from your wallet...");
  const fundTx = new anchor.web3.Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: providerKp.publicKey,
      lamports: FUND_PROVIDER_LAMPORTS,
    }),
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: clientKp.publicKey,
      lamports: FUND_CLIENT_LAMPORTS,
    })
  );
  const fundSig = await provider.sendAndConfirm(fundTx, []);
  await logTx("fund", fundSig);

  const [agreement] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("agreement"),
      providerKp.publicKey.toBuffer(),
      clientKp.publicKey.toBuffer(),
    ],
    program.programId
  );
  const orderId = 0;
  const [order] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("order"),
      agreement.toBuffer(),
      new anchor.BN(orderId).toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );

  console.log("\nRunning the agreement -> order -> Closed flow:");

  // The client only needs accounts it can't auto-resolve: PDAs (agreement,
  // order) are derived from seeds, and provider/client/courier are derived
  // via each instruction's `relations` once agreement/order are known. Only
  // the still-ambiguous accounts need to be passed explicitly.
  let sig = await program.methods
    .initAgreement(courierKp.publicKey, new anchor.BN(DELIVERY_TIMEOUT_SECONDS))
    .accounts({ provider: providerKp.publicKey, client: clientKp.publicKey })
    .signers([providerKp])
    .rpc();
  await logTx("init_agreement", sig);

  sig = await program.methods
    .acceptAgreement()
    .accounts({ agreement })
    .signers([clientKp])
    .rpc();
  await logTx("accept_agreement", sig);

  sig = await program.methods
    .createOrder(new anchor.BN(orderId))
    .accounts({ agreement })
    .signers([providerKp])
    .rpc();
  await logTx("create_order", sig);

  sig = await program.methods
    .setFulfillmentPrice(new anchor.BN(FULFILLMENT_PRICE))
    .accounts({ order })
    .signers([providerKp])
    .rpc();
  await logTx("set_fulfillment_price", sig);

  sig = await program.methods
    .setShipmentPrice(new anchor.BN(SHIPMENT_PRICE))
    .accounts({ order })
    .signers([providerKp])
    .rpc();
  await logTx("set_shipment_price", sig);

  sig = await program.methods
    .markProcessed()
    .accounts({ order })
    .signers([providerKp])
    .rpc();
  await logTx("mark_processed", sig);

  const providerBefore = await connection.getBalance(providerKp.publicKey);
  const courierBefore = await connection.getBalance(courierKp.publicKey);

  sig = await program.methods
    .pay(new anchor.BN(TOTAL))
    .accounts({ order })
    .signers([clientKp])
    .rpc();
  await logTx("pay", sig);

  const invoiceHash = Array.from(
    crypto
      .createHash("sha256")
      .update(Buffer.from("devnet-smoke-test"))
      .digest()
  );
  sig = await program.methods
    .sendInvoice(invoiceHash)
    .accounts({ order })
    .signers([providerKp])
    .rpc();
  await logTx("send_invoice", sig);

  sig = await program.methods
    .confirmDelivery()
    .accounts({ order })
    .signers([courierKp])
    .rpc();
  await logTx("confirm_delivery", sig);

  const providerAfter = await connection.getBalance(providerKp.publicKey);
  const courierAfter = await connection.getBalance(courierKp.publicKey);
  const orderAccount = await program.account.order.fetch(order);

  console.log("\nResult:");
  console.log(`  order status: ${Object.keys(orderAccount.status)[0]}`);
  console.log(
    `  provider gained: ${
      (providerAfter - providerBefore) / LAMPORTS_PER_SOL
    } SOL ` + `(expected ${FULFILLMENT_PRICE / LAMPORTS_PER_SOL})`
  );
  console.log(
    `  courier gained:  ${
      (courierAfter - courierBefore) / LAMPORTS_PER_SOL
    } SOL ` + `(expected ${SHIPMENT_PRICE / LAMPORTS_PER_SOL})`
  );

  if (
    Object.keys(orderAccount.status)[0] !== "closed" ||
    providerAfter - providerBefore !== FULFILLMENT_PRICE ||
    courierAfter - courierBefore !== SHIPMENT_PRICE
  ) {
    throw new Error(
      "Smoke test completed but balances/status don't match expectations."
    );
  }

  console.log(
    "\nAll 9 transactions landed on devnet and the escrow paid out exactly as designed."
  );
}

main().catch((err) => {
  console.error("\nSmoke test failed:", err);
  process.exit(1);
});
