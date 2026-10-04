import type { PublicKey } from "@solana/web3.js";
import type { Agreement, Order, Role } from "./types";

// Decides which buttons to SHOW. This is only UX: the program must reject the same actions
// on its own (AGENTS.md hard rule). If the program's rules change, update this file so the
// UI doesn't offer buttons that will fail.

export function rolesFor(wallet: PublicKey, agreement: Agreement): Role[] {
   const roles: Role[] = [];
   if (agreement.provider.equals(wallet)) roles.push("provider");
   if (agreement.client.equals(wallet)) roles.push("client");
   if (agreement.courier.equals(wallet)) roles.push("courier");
   // The program requires three distinct wallets, so this is normally a single role.
   return roles;
}

export const ROLE_LABEL: Record<Role, string> = {
   provider: "3PL",
   client: "Client",
   courier: "Courier",
};

export type OrderAction =
   | "setPrices"
   | "markProcessed"
   | "pay"
   | "sendInvoice"
   | "confirmDelivery"
   | "cancel"
   | "refundExpired";

export function refundAvailableAt(
   agreement: Agreement,
   order: Order,
): number | null {
   return order.paidAt === null
      ? null
      : order.paidAt + agreement.deliveryTimeoutSecs;
}

export function allowedOrderActions(
   roles: Role[],
   agreement: Agreement,
   order: Order,
   nowSecs: number,
): OrderAction[] {
   const is = (r: Role) => roles.includes(r);
   const s = order.status;
   const actions: OrderAction[] = [];

   // MIRRORS: state_machine.rs `next()` (which status allows which action) and the signer
   // checks in each instructions/<name>.rs (which role may call it).
   if (is("provider") && s === "Created") actions.push("setPrices");
   // MIRRORS: mark_processed.rs only requires the TOTAL to be > 0 (one fee may be 0).
   if (
      is("provider") &&
      s === "Created" &&
      order.fulfillmentPrice + order.shipmentPrice > 0n
   )
      actions.push("markProcessed");
   if (is("client") && s === "Processed") actions.push("pay");
   if (is("provider") && s === "Paid") actions.push("sendInvoice");
   if (is("courier") && s === "Invoiced") actions.push("confirmDelivery");
   if ((is("provider") || is("client")) && (s === "Created" || s === "Processed"))
      actions.push("cancel");
   // MIRRORS: math.rs is_expired(): refund allowed once now >= paid_at + delivery_timeout.
   const refundAt = refundAvailableAt(agreement, order);
   if (
      is("client") &&
      (s === "Paid" || s === "Invoiced") &&
      refundAt !== null &&
      nowSecs >= refundAt
   )
      actions.push("refundExpired");

   return actions;
}
