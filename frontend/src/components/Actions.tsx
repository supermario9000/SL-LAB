import { useState } from "react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { useProgram } from "../hooks/useProgram";
import { useTx } from "../hooks/useTx";
import * as contract from "../lib/contract";
import { formatSol, parseSol } from "../lib/format";
import { buildInvoice, invoiceHash } from "../lib/invoice";
import { allowedOrderActions, ROLE_LABEL, rolesFor } from "../lib/permissions";
import type { Agreement, Order } from "../lib/types";
import { InvoiceDocument } from "./Invoice";

interface Props {
   agreement: Agreement;
   order: Order;
   now: number;
   onChanged: () => void;
}

// Shows only the actions the connected wallet's role may take in the order's current status.
// The program enforces the same rules; hiding a button here is just convenience.
export function Actions({ agreement, order, now, onChanged }: Props) {
   const wallet = useAnchorWallet();
   const program = useProgram();
   const { run, pending } = useTx();
   if (!wallet || !program) return null;

   const roles = rolesFor(wallet.publicKey, agreement);
   const actions = allowedOrderActions(roles, agreement, order, now);
   const total = order.fulfillmentPrice + order.shipmentPrice;

   const send = async (label: string, fn: () => Promise<string>) => {
      const ok = await run(label, fn);
      if (ok) onChanged();
      return ok;
   };

   if (actions.length === 0) {
      return (
         <p className="muted small">
            Nothing for you to do right now
            {roles.length ? ` as ${roles.map((r) => ROLE_LABEL[r]).join(" + ")}` : ""}. Waiting for the
            other party.
         </p>
      );
   }

   return (
      <div className="actions">
         <h3>Your actions</h3>

         {actions.includes("setPrices") && (
            <PriceForm
               order={order}
               disabled={!!pending}
               onSetPrices={(f, s) =>
                  send("Set fees", () => contract.setPrices(program, order, f, s))
               }
            />
         )}

         {actions.includes("setPrices") && !actions.includes("markProcessed") && (
            <p className="muted small">Set at least one fee above 0 to mark the order ready.</p>
         )}

         {actions.includes("markProcessed") && (
            <button
               disabled={!!pending}
               onClick={() => send("Mark packed & ready", () => contract.markProcessed(program, order))}
            >
               Mark packed & ready for payment (locks prices)
            </button>
         )}

         {actions.includes("pay") && (
            <button
               className="primary"
               disabled={!!pending}
               onClick={() => send(`Pay ${formatSol(total)} into escrow`, () => contract.pay(program, order))}
            >
               Pay {formatSol(total)} into escrow
            </button>
         )}

         {actions.includes("sendInvoice") && (
            <IssueInvoice
               agreement={agreement}
               order={order}
               disabled={!!pending}
               onIssue={(hash) => send("Issue invoice", () => contract.sendInvoice(program, order, hash))}
            />
         )}

         {actions.includes("confirmDelivery") && (
            <button
               className="primary"
               disabled={!!pending}
               onClick={() =>
                  send("Confirm delivery & release payment", () =>
                     contract.confirmDelivery(program, agreement, order),
                  )
               }
            >
               Confirm delivery: pay {formatSol(order.fulfillmentPrice)} to 3PL and{" "}
               {formatSol(order.shipmentPrice)} to courier
            </button>
         )}

         {actions.includes("refundExpired") && (
            <button
               className="primary"
               disabled={!!pending}
               onClick={() => send("Claim refund", () => contract.refundExpired(program, order))}
            >
               Claim full refund ({formatSol(total)})
            </button>
         )}

         {actions.includes("cancel") && (
            <button
               className="danger"
               disabled={!!pending}
               onClick={() => {
                  if (confirm("Cancel this order? This cannot be undone.")) {
                     send("Cancel order", () => contract.cancelOrder(program, order));
                  }
               }}
            >
               Cancel order
            </button>
         )}

         {pending && <p className="muted small">Waiting for “{pending}”… approve it in your wallet.</p>}
      </div>
   );
}

function PriceForm(props: {
   order: Order;
   disabled: boolean;
   onSetPrices: (fulfillment: bigint | null, shipment: bigint | null) => Promise<boolean>;
}) {
   // Left blank on purpose: a pre-filled placeholder amount is too easy to submit by accident
   // instead of the real fee. The review step below is the second safety net for the same reason.
   const [fulfillment, setFulfillment] = useState("");
   const [shipment, setShipment] = useState("");
   const [error, setError] = useState<string | null>(null);
   const [review, setReview] = useState<{ fulfillment: bigint | null; shipment: bigint | null } | null>(
      null,
   );

   function openReview(e: React.FormEvent) {
      e.preventDefault();
      try {
         const fulfillmentLamports = fulfillment.trim() ? parseSol(fulfillment) : null;
         const shipmentLamports = shipment.trim() ? parseSol(shipment) : null;
         if (fulfillmentLamports === null && shipmentLamports === null) {
            setError("Enter a fulfillment fee, a shipping fee, or both.");
            return;
         }
         setError(null);
         setReview({ fulfillment: fulfillmentLamports, shipment: shipmentLamports });
      } catch (e) {
         setError((e as Error).message);
      }
   }

   // Both fees are sent in one transaction; if it is rejected the review stays open.
   async function confirm() {
      if (!review) return;
      if (!(await props.onSetPrices(review.fulfillment, review.shipment))) return;
      setReview(null);
      setFulfillment("");
      setShipment("");
   }

   if (review) {
      const newTotal =
         (review.fulfillment ?? props.order.fulfillmentPrice) + (review.shipment ?? props.order.shipmentPrice);
      return (
         <div className="form">
            <p>
               <strong>Review before submitting</strong>
            </p>
            {review.fulfillment !== null && (
               <p className="small">
                  Fulfillment fee: {formatSol(props.order.fulfillmentPrice)} →{" "}
                  <strong>{formatSol(review.fulfillment)}</strong>
               </p>
            )}
            {review.shipment !== null && (
               <p className="small">
                  Shipping fee: {formatSol(props.order.shipmentPrice)} →{" "}
                  <strong>{formatSol(review.shipment)}</strong>
               </p>
            )}
            <p className="small">
               New total the client would pay: <strong>{formatSol(newTotal)}</strong>
            </p>
            <span className="row">
               <button type="button" disabled={props.disabled} onClick={() => setReview(null)}>
                  Back
               </button>
               <button type="button" disabled={props.disabled} onClick={confirm}>
                  Confirm & submit
               </button>
            </span>
         </div>
      );
   }

   return (
      <form className="form" onSubmit={openReview}>
         <label>
            Fulfillment fee in SOL (now {formatSol(props.order.fulfillmentPrice)})
            <input
               value={fulfillment}
               onChange={(e) => setFulfillment(e.target.value)}
               placeholder="e.g. 1.5"
            />
         </label>
         <label>
            Shipping fee in SOL (now {formatSol(props.order.shipmentPrice)})
            {/* Off-chain: the 3PL takes this from the courier's pricelist (flowchart). */}
            <input
               value={shipment}
               onChange={(e) => setShipment(e.target.value)}
               placeholder="e.g. 0.5"
            />
         </label>
         {error && <p className="error">{error}</p>}
         <button type="submit" disabled={props.disabled}>
            Review fees
         </button>
      </form>
   );
}

// The invoice is generated from the order's on-chain data; only its SHA-256 fingerprint is
// stored by the program. The client rebuilds the same invoice to check it (see Invoice.tsx).
function IssueInvoice(props: {
   agreement: Agreement;
   order: Order;
   disabled: boolean;
   onIssue: (hash: string) => void;
}) {
   const invoice = buildInvoice(props.agreement, props.order);
   return (
      <div className="form">
         <details>
            <summary>Preview invoice {invoice.number}</summary>
            <InvoiceDocument invoice={invoice} />
         </details>
         <button disabled={props.disabled} onClick={async () => props.onIssue(await invoiceHash(invoice))}>
            Issue invoice
         </button>
      </div>
   );
}
