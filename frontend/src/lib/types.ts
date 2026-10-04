import type { PublicKey } from "@solana/web3.js";

// These are the shapes the UI works with. They are deliberately decoupled from the raw
// Anchor account layout: src/lib/contract.ts converts raw accounts into these types,
// so a change in the program's field names only needs fixing in one place.

// MIRRORS: state.rs `OrderStatus` (same names, same order).
export const ORDER_STATUSES = [
   "Created",
   "Processed",
   "Paid",
   "Invoiced",
   "Closed",
   "Cancelled",
   "Refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Agreement {
   address: PublicKey;
   provider: PublicKey; // the 3PL
   client: PublicKey;
   courier: PublicKey;
   deliveryTimeoutSecs: number;
   accepted: boolean;
   nextOrderId: bigint; // id the next order must use (= number of orders so far)
}

export interface Order {
   address: PublicKey;
   agreement: PublicKey;
   orderId: bigint;
   status: OrderStatus;
   fulfillmentPrice: bigint; // lamports
   shipmentPrice: bigint; // lamports
   createdAt: number; // unix seconds
   paidAt: number | null; // unix seconds, null until paid
   invoiceHash: string | null; // hex sha256, null until invoiced
}

export type Role = "provider" | "client" | "courier";
