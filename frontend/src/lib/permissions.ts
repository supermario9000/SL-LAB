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
   return roles; // one wallet may hold several roles in a single-wallet demo
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

   // BACKEND-DEPENDENT: every condition below mirrors a rule in the program's state_machine.rs.
   if (is("provider") && s === "Created") actions.push("setPrices");
   // BACKEND-DEPENDENT: assumes mark_processed requires both prices to be set (> 0).
   if (
      is("provider") &&
      s === "Created" &&
      order.fulfillmentPrice > 0n &&
      order.shipmentPrice > 0n
   )
      actions.push("markProcessed");
   if (is("client") && s === "Processed") actions.push("pay");
   if (is("provider") && s === "Paid") actions.push("sendInvoice");
   // BACKEND-DEPENDENT: assumes confirm_delivery is only allowed after the invoice (Invoiced),
   // as in the flowchart. If the program also allows it from Paid, add "Paid" here.
   if (is("courier") && s === "Invoiced") actions.push("confirmDelivery");
   if ((is("provider") || is("client")) && (s === "Created" || s === "Processed"))
      actions.push("cancel");
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
