// The ONLY file that knows how the on-chain program's instructions and accounts are shaped.
// Components call these functions and receive plain UI types (src/lib/types.ts).
// Program source: chaind_logistics/programs/chaind_logistics/src/. Each MIRRORS note names the
// file to compare with if the program changes.

import { AnchorError, BN, type AccountClient, type Program } from "@coral-xyz/anchor";
import {
   Keypair,
   SystemProgram,
   TransactionMessage,
   VersionedTransaction,
   type PublicKey,
} from "@solana/web3.js";
import { PROGRAM_ID } from "../config";
import { hexToBytes } from "./format";
import { agreementPda, orderPda } from "./pda";
import {
   ORDER_STATUSES,
   type Agreement,
   type Order,
   type OrderStatus,
} from "./types";

// ---------- Reading accounts ----------

// MIRRORS: state.rs `Agreement` and `Order`. Field names as Anchor decodes them
// (snake_case in Rust becomes camelCase in TS).
interface RawAgreement {
   provider: PublicKey;
   client: PublicKey;
   courier: PublicKey;
   deliveryTimeout: BN;
   accepted: boolean;
   nextOrderId: BN;
}
interface RawOrder {
   agreement: PublicKey;
   orderId: BN;
   status: Record<string, object>; // Anchor decodes enums as e.g. { paid: {} }
   fulfillmentPrice: BN;
   shipmentPrice: BN;
   createdAt: BN;
   paidAt: BN;
   invoiceHash: number[];
}

const toBigInt = (bn: BN) => BigInt(bn.toString());

// With the generic `Idl` type, TypeScript doesn't know which account types exist, so they are
// listed here by hand (`pub struct Agreement` / `Order` become `agreement` / `order`).
const accounts = (program: Program) =>
   program.account as unknown as Record<"agreement" | "order", AccountClient>;

function decodeStatus(raw: Record<string, object>): OrderStatus {
   const key = Object.keys(raw)[0]?.toLowerCase();
   const status = ORDER_STATUSES.find((s) => s.toLowerCase() === key);
   if (!status) throw new Error(`Unknown order status from chain: ${key}`);
   return status;
}

function decodeAgreement(address: PublicKey, a: RawAgreement): Agreement {
   return {
      address,
      provider: a.provider,
      client: a.client,
      courier: a.courier,
      deliveryTimeoutSecs: a.deliveryTimeout.toNumber(),
      accepted: a.accepted,
      nextOrderId: toBigInt(a.nextOrderId),
   };
}

function decodeOrder(address: PublicKey, o: RawOrder): Order {
   // MIRRORS: state.rs: paid_at is 0 until paid, invoice_hash is all zeroes until invoiced.
   const paidAt = o.paidAt.toNumber();
   const hasInvoice = o.invoiceHash.some((b) => b !== 0);
   return {
      address,
      agreement: o.agreement,
      orderId: toBigInt(o.orderId),
      status: decodeStatus(o.status),
      fulfillmentPrice: toBigInt(o.fulfillmentPrice),
      shipmentPrice: toBigInt(o.shipmentPrice),
      createdAt: o.createdAt.toNumber(),
      paidAt: paidAt > 0 ? paidAt : null,
      invoiceHash: hasInvoice
         ? o.invoiceHash.map((b) => b.toString(16).padStart(2, "0")).join("")
         : null,
   };
}

// Fetches every agreement and filters in the browser. Fine for a hackathon-sized devnet
// program, and it avoids hard-coding byte offsets for memcmp filters.
export async function fetchAgreements(program: Program): Promise<Agreement[]> {
   const all = await accounts(program).agreement.all();
   return all.map((a) => decodeAgreement(a.publicKey, a.account as RawAgreement));
}

export async function fetchOrders(
   program: Program,
   agreement: PublicKey,
): Promise<Order[]> {
   const all = await accounts(program).order.all();
   return all
      .map((o) => decodeOrder(o.publicKey, o.account as RawOrder))
      .filter((o) => o.agreement.equals(agreement))
      .sort((a, b) => Number(b.orderId - a.orderId));
}

export type DeploymentStatus = "ok" | "missing" | "wrong-build" | "unknown";

// Checks that a program exists at PROGRAM_ID AND that it was built for that address.
// A binary built with a different declare_id! rejects every instruction with
// DeclaredProgramIdMismatch, so we simulate one harmless call (no signature, no fee, no popup)
// and look for that error. Needs a funded wallet as the simulated fee payer.
export async function checkDeployment(
   program: Program,
): Promise<DeploymentStatus> {
   const { connection } = program.provider;
   const info = await connection.getAccountInfo(PROGRAM_ID);
   if (!info?.executable) return "missing";
   try {
      const payer = wallet(program);
      const ix = await program.methods
         .acceptAgreement()
         .accountsPartial({ client: payer, agreement: Keypair.generate().publicKey })
         .instruction();
      const message = new TransactionMessage({
         payerKey: payer,
         recentBlockhash: payer.toBase58(), // replaced by the RPC (replaceRecentBlockhash)
         instructions: [ix],
      }).compileToV0Message();
      const sim = await connection.simulateTransaction(new VersionedTransaction(message), {
         sigVerify: false,
         replaceRecentBlockhash: true,
      });
      const logs = sim.value.logs?.join("\n") ?? "";
      if (logs.includes("DeclaredProgramIdMismatch")) return "wrong-build";
      // Any other Anchor error (expected: the random agreement doesn't exist) means the
      // program got past its id check, i.e. the build matches.
      return logs.includes("AnchorError") ? "ok" : "unknown";
   } catch {
      return "unknown";
   }
}

// ---------- Sending instructions ----------
// Each function returns the transaction signature (for the explorer link).
// MIRRORS (all below): lib.rs instruction signatures and the Accounts structs in
// instructions/<name>.rs. accountsPartial() is used so that every account is passed explicitly and nothing depends on
// Anchor's automatic account resolution.

const wallet = (program: Program) => program.provider.publicKey!;

export async function initAgreement(
   program: Program,
   args: { client: PublicKey; courier: PublicKey; deliveryTimeoutSecs: number },
): Promise<string> {
   const provider = wallet(program);
   return program.methods
      .initAgreement(args.courier, new BN(args.deliveryTimeoutSecs))
      .accountsPartial({
         provider,
         client: args.client,
         agreement: agreementPda(provider, args.client),
         systemProgram: SystemProgram.programId,
      })
      .rpc();
}

export async function acceptAgreement(
   program: Program,
   agreement: Agreement,
): Promise<string> {
   return program.methods
      .acceptAgreement()
      .accountsPartial({ client: wallet(program), agreement: agreement.address })
      .rpc();
}

// The program requires order_id == agreement.next_order_id (create_order.rs), then increments it.
// If two orders are registered at the same moment, the second fails with "Order id must be the
// next id"; refreshing and retrying fixes it.
export async function createOrder(
   program: Program,
   agreement: Agreement,
): Promise<string> {
   const orderId = agreement.nextOrderId;
   return program.methods
      .createOrder(new BN(orderId.toString()))
      .accountsPartial({
         provider: wallet(program),
         agreement: agreement.address,
         order: orderPda(agreement.address, orderId),
         systemProgram: SystemProgram.programId,
      })
      .rpc();
}

const providerOrderAccounts = (program: Program, order: Order) => ({
   provider: wallet(program),
   agreement: order.agreement,
   order: order.address,
});

export async function setFulfillmentPrice(
   program: Program,
   order: Order,
   lamports: bigint,
): Promise<string> {
   return program.methods
      .setFulfillmentPrice(new BN(lamports.toString()))
      .accountsPartial(providerOrderAccounts(program, order))
      .rpc();
}

export async function setShipmentPrice(
   program: Program,
   order: Order,
   lamports: bigint,
): Promise<string> {
   return program.methods
      .setShipmentPrice(new BN(lamports.toString()))
      .accountsPartial(providerOrderAccounts(program, order))
      .rpc();
}

export async function markProcessed(
   program: Program,
   order: Order,
): Promise<string> {
   return program.methods
      .markProcessed()
      .accountsPartial(providerOrderAccounts(program, order))
      .rpc();
}

// expected_total is the total the client saw on screen. If the 3PL somehow changed a price
// in between, the program rejects the payment instead of charging a different amount.
export async function pay(program: Program, order: Order): Promise<string> {
   const total = order.fulfillmentPrice + order.shipmentPrice;
   return program.methods
      .pay(new BN(total.toString()))
      .accountsPartial({
         client: wallet(program),
         agreement: order.agreement,
         order: order.address,
         systemProgram: SystemProgram.programId,
      })
      .rpc();
}

export async function sendInvoice(
   program: Program,
   order: Order,
   sha256Hex: string,
): Promise<string> {
   return program.methods
      .sendInvoice(hexToBytes(sha256Hex))
      .accountsPartial(providerOrderAccounts(program, order))
      .rpc();
}

// The 3PL's wallet is passed so the program can pay it; `has_one = provider` checks it.
export async function confirmDelivery(
   program: Program,
   agreement: Agreement,
   order: Order,
): Promise<string> {
   return program.methods
      .confirmDelivery()
      .accountsPartial({
         courier: wallet(program),
         provider: agreement.provider,
         agreement: order.agreement,
         order: order.address,
      })
      .rpc();
}

// The signer may be the 3PL or the client (cancel_order.rs checks which).
export async function cancelOrder(
   program: Program,
   order: Order,
): Promise<string> {
   return program.methods
      .cancelOrder()
      .accountsPartial({
         signer: wallet(program),
         agreement: order.agreement,
         order: order.address,
      })
      .rpc();
}

export async function refundExpired(
   program: Program,
   order: Order,
): Promise<string> {
   return program.methods
      .refundExpired()
      .accountsPartial({
         client: wallet(program),
         agreement: order.agreement,
         order: order.address,
      })
      .rpc();
}

// ---------- Errors ----------

// Turns wallet/RPC/program errors into one readable line. Program errors show the
// #[msg("...")] text from error.rs.
export function describeError(err: unknown): string {
   const e = err as { message?: string; logs?: string[] };
   const anchorErr =
      err instanceof AnchorError ? err : e?.logs ? AnchorError.parse(e.logs) : null;
   if (anchorErr) {
      // Anchor's own constraint errors fire when the wallet isn't the party the account expects
      // (e.g. `has_one = provider` in the Accounts struct).
      if (["ConstraintHasOne", "ConstraintSigner"].includes(anchorErr.error.errorCode.code))
         return "Your wallet doesn't have the right role for this action on this agreement.";
      return anchorErr.error.errorMessage;
   }
   const msg = [e?.message ?? String(err), ...(e?.logs ?? [])].join("\n");
   if (/User rejected/i.test(msg)) return "You rejected the transaction in your wallet.";
   if (/already in use/i.test(msg))
      return "That account already exists (e.g. an agreement with this client, or an order id that was just used). Refresh and try again.";
   if (/program that does not exist|ProgramAccountNotFound/i.test(msg))
      return "The program is not deployed at the configured address on this network.";
   return msg;
}
