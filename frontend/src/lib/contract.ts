// The ONLY file that knows how the on-chain program's instructions and accounts are shaped.
// Components call these functions and receive plain UI types (src/lib/types.ts).
// When the real program lands, compare every BACKEND-DEPENDENT note here with the synced IDL.

import { AnchorError, BN, type AccountClient, type Program } from "@coral-xyz/anchor";
import {
   SystemProgram,
   type Connection,
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

// BACKEND-DEPENDENT: raw account field names as Anchor decodes them (snake_case in Rust
// becomes camelCase in TS). Must match the `Agreement` and `Order` structs in state.rs.
interface RawAgreement {
   provider: PublicKey;
   client: PublicKey;
   courier: PublicKey;
   deliveryTimeout: BN;
   accepted: boolean;
   orderCount: BN;
}
interface RawOrder {
   agreement: PublicKey;
   orderId: BN;
   status: Record<string, object>; // Anchor decodes enums as e.g. { paid: {} }
   fulfillmentPrice: BN;
   shipmentPrice: BN;
   paidAt: BN;
   invoiceHash: number[];
}

const toBigInt = (bn: BN) => BigInt(bn.toString());

// With the generic (placeholder) IDL type, TypeScript doesn't know which account types exist,
// so they are listed here by hand.
// BACKEND-DEPENDENT: account names `agreement` / `order` (from `pub struct Agreement` / `Order`).
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
      orderCount: toBigInt(a.orderCount),
   };
}

function decodeOrder(address: PublicKey, o: RawOrder): Order {
   // BACKEND-DEPENDENT: assumes "not paid yet" is stored as paid_at = 0 and "no invoice"
   // as an all-zero hash (instead of Option<...>).
   const paidAt = o.paidAt.toNumber();
   const hasInvoice = o.invoiceHash.some((b) => b !== 0);
   return {
      address,
      agreement: o.agreement,
      orderId: toBigInt(o.orderId),
      status: decodeStatus(o.status),
      fulfillmentPrice: toBigInt(o.fulfillmentPrice),
      shipmentPrice: toBigInt(o.shipmentPrice),
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

// BACKEND-DEPENDENT: assumes the Order account stores its `agreement` pubkey.
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

export async function programIsDeployed(connection: Connection) {
   const info = await connection.getAccountInfo(PROGRAM_ID);
   return info?.executable ?? false;
}

// ---------- Sending instructions ----------
// Each function returns the transaction signature (for the explorer link).
// BACKEND-DEPENDENT (all below): instruction names, argument types, and the account names
// passed to accountsPartial() must match the Accounts structs in programs/fulfillment/src/instructions/.
// accountsPartial() is used so that every account is passed explicitly and nothing depends on
// Anchor's automatic account resolution.

const wallet = (program: Program) => program.provider.publicKey!;

export async function initAgreement(
   program: Program,
   args: { client: PublicKey; courier: PublicKey; deliveryTimeoutSecs: number },
): Promise<string> {
   const provider = wallet(program);
   return program.methods
      .initAgreement(new BN(args.deliveryTimeoutSecs))
      .accountsPartial({
         provider,
         client: args.client,
         courier: args.courier,
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

// BACKEND-DEPENDENT: assumes the new order's id is the agreement's current `order_count`
// and that the program checks it (then increments the counter). If the program picks the id
// itself without an argument, drop the argument but keep deriving the PDA from order_count.
export async function createOrder(
   program: Program,
   agreement: Agreement,
): Promise<string> {
   const orderId = agreement.orderCount;
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

// BACKEND-DEPENDENT: the 3PL account must be passed (writable) so the program can pay it.
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

// BACKEND-DEPENDENT: the signer account name for "3PL or client" is assumed to be `authority`.
export async function cancelOrder(
   program: Program,
   order: Order,
): Promise<string> {
   return program.methods
      .cancelOrder()
      .accountsPartial({
         authority: wallet(program),
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
   if (err instanceof AnchorError) return err.error.errorMessage;
   const e = err as { message?: string; logs?: string[] };
   if (e?.logs) {
      const parsed = AnchorError.parse(e.logs);
      if (parsed) return parsed.error.errorMessage;
   }
   const msg = e?.message ?? String(err);
   if (/User rejected/i.test(msg)) return "You rejected the transaction in your wallet.";
   if (/program that does not exist|ProgramAccountNotFound/i.test(msg))
      return "The program is not deployed at the configured address on this network.";
   return msg;
}
