import type { OrderStatus } from "./types";

// Business wording for each status, shown to users instead of the raw enum name.
export const STATUS_INFO: Record<
   OrderStatus,
   { label: string; description: string }
> = {
   Created: {
      label: "Created",
      description: "The 3PL registered the order and is setting prices.",
   },
   Processed: {
      label: "Ready for payment",
      description: "Picked and packed. Prices are locked and the client can pay.",
   },
   Paid: {
      label: "Paid (in escrow)",
      description: "The payment is held by the program. Nobody can take it out except by the rules.",
   },
   Invoiced: {
      label: "Invoiced, in delivery",
      description: "The invoice fingerprint is on-chain. Waiting for the courier to confirm delivery.",
   },
   Closed: {
      label: "Delivered & paid out",
      description: "Delivery confirmed. The 3PL and the courier were paid in one transaction.",
   },
   Cancelled: {
      label: "Cancelled",
      description: "Cancelled before payment. No money moved.",
   },
   Refunded: {
      label: "Refunded",
      description: "Delivery deadline passed. The full payment went back to the client.",
   },
};

// MIRRORS: state_machine.rs `next()`: the happy path (also drawn in planning/flowchart.png).
export const HAPPY_PATH: OrderStatus[] = [
   "Created",
   "Processed",
   "Paid",
   "Invoiced",
   "Closed",
];

export const isTerminal = (s: OrderStatus) =>
   s === "Closed" || s === "Cancelled" || s === "Refunded";
