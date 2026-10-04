import { PROGRAM_ID } from "../config";
import { sha256Hex } from "./format";
import type { Agreement, Order } from "./types";

// The invoice is built only from on-chain data, so the 3PL (when issuing) and the client
// (when checking) always produce the same document and the same fingerprint. Nothing is
// uploaded or stored off-chain.
//
// Changing anything below changes every fingerprint: never edit format v1, add a v2 instead.
export const INVOICE_FORMAT = "chaind-logistics-invoice/v1";

export interface InvoiceLine {
   description: string;
   payTo: string; // base58 wallet that receives this amount on delivery
   lamports: string; // bigint as a decimal string (JSON has no bigint)
}

export interface Invoice {
   format: string;
   number: string;
   program: string;
   agreement: string;
   order: string;
   orderId: string;
   provider: string;
   client: string;
   courier: string;
   createdAt: number; // unix seconds
   paidAt: number | null; // unix seconds
   lines: InvoiceLine[];
   totalLamports: string;
}

export function buildInvoice(agreement: Agreement, order: Order): Invoice {
   // Keys are listed in a fixed order: JSON.stringify keeps insertion order, so the
   // serialized invoice (and its fingerprint) is the same in every browser.
   return {
      format: INVOICE_FORMAT,
      number: `INV-${order.agreement.toBase58().slice(0, 8)}-${order.orderId}`,
      program: PROGRAM_ID.toBase58(),
      agreement: order.agreement.toBase58(),
      order: order.address.toBase58(),
      orderId: order.orderId.toString(),
      provider: agreement.provider.toBase58(),
      client: agreement.client.toBase58(),
      courier: agreement.courier.toBase58(),
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      lines: [
         {
            description: "Order fulfillment (storage, pick, pack)",
            payTo: agreement.provider.toBase58(),
            lamports: order.fulfillmentPrice.toString(),
         },
         {
            description: "Shipment (courier delivery)",
            payTo: agreement.courier.toBase58(),
            lamports: order.shipmentPrice.toString(),
         },
      ],
      totalLamports: (order.fulfillmentPrice + order.shipmentPrice).toString(),
   };
}

// The 32-byte value `send_invoice` stores on-chain.
export function invoiceHash(invoice: Invoice): Promise<string> {
   return sha256Hex(new TextEncoder().encode(JSON.stringify(invoice)).buffer);
}
