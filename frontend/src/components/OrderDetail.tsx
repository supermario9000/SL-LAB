import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { Address } from "./Address";
import { Actions } from "./Actions";
import { formatDate, formatDuration, formatSol, sha256Hex } from "../lib/format";
import { refundAvailableAt } from "../lib/permissions";
import { HAPPY_PATH, STATUS_INFO, isTerminal } from "../lib/status";
import type { Agreement, Order } from "../lib/types";

interface Props {
   agreement: Agreement;
   order: Order;
   onChanged: () => void;
}

export function OrderDetail({ agreement, order, onChanged }: Props) {
   const now = useNow();
   const balance = useBalance(order);
   const total = order.fulfillmentPrice + order.shipmentPrice;
   const refundAt = refundAvailableAt(agreement, order);
   const inEscrow = order.status === "Paid" || order.status === "Invoiced";

   return (
      <section className="card">
         <h2>Order #{order.orderId.toString()}</h2>
         <StatusTimeline order={order} />
         <p className="muted">{STATUS_INFO[order.status].description}</p>

         <dl className="facts">
            <dt>Fulfillment fee (to 3PL)</dt>
            <dd>{formatSol(order.fulfillmentPrice)}</dd>
            <dt>Shipping fee (to courier)</dt>
            <dd>{formatSol(order.shipmentPrice)}</dd>
            <dt>Total</dt>
            <dd>
               <strong>{formatSol(total)}</strong>
            </dd>
            <dt>Registered</dt>
            <dd>{formatDate(order.createdAt)}</dd>
            <dt>Order account</dt>
            <dd>
               <Address value={order.address} />
               {balance !== null && (
                  <span className="muted"> · holds {formatSol(balance)} (incl. rent)</span>
               )}
            </dd>
            {order.paidAt !== null && (
               <>
                  <dt>Paid at</dt>
                  <dd>{formatDate(order.paidAt)}</dd>
               </>
            )}
            {inEscrow && refundAt !== null && (
               <>
                  <dt>Client refund</dt>
                  <dd>
                     {now >= refundAt
                        ? "Available now (delivery deadline passed)"
                        : `Available in ${formatDuration(refundAt - now)} if not delivered`}
                  </dd>
               </>
            )}
         </dl>

         {inEscrow && (
            <div className="banner info">
               {formatSol(total)} is locked in the order account. Only two things can release it: the
               courier confirming delivery (pays the 3PL and the courier together) or the deadline passing
               (refunds the client). Nobody else, including the app's authors, can move it.
            </div>
         )}

         {order.invoiceHash && <InvoiceCheck hash={order.invoiceHash} />}

         {!isTerminal(order.status) && (
            <Actions agreement={agreement} order={order} now={now} onChanged={onChanged} />
         )}
      </section>
   );
}

function StatusTimeline({ order }: { order: Order }) {
   const offPath = !HAPPY_PATH.includes(order.status);
   const reached = HAPPY_PATH.indexOf(order.status);
   return (
      <ol className="timeline">
         {HAPPY_PATH.map((s, i) => (
            <li key={s} className={!offPath && i <= reached ? "done" : ""}>
               {STATUS_INFO[s].label}
            </li>
         ))}
         {offPath && <li className="done off">{STATUS_INFO[order.status].label}</li>}
      </ol>
   );
}

// Anyone holding the invoice file can check it matches the fingerprint stored on-chain.
function InvoiceCheck({ hash }: { hash: string }) {
   const [result, setResult] = useState<"match" | "mismatch" | null>(null);
   return (
      <div className="sub">
         <div className="small">
            Invoice fingerprint (SHA-256): <span className="mono break">{hash}</span>
         </div>
         <label className="small">
            Verify an invoice file:{" "}
            <input
               type="file"
               onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const h = await sha256Hex(await file.arrayBuffer());
                  setResult(h === hash ? "match" : "mismatch");
               }}
            />
         </label>
         {result === "match" && <p className="ok-text">✓ This file is the invoice recorded on-chain.</p>}
         {result === "mismatch" && <p className="error">✗ This file does not match the on-chain invoice.</p>}
      </div>
   );
}

// Current unix time in seconds, updated every second (drives the refund countdown).
function useNow() {
   const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
   useEffect(() => {
      const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
      return () => clearInterval(t);
   }, []);
   return now;
}

// The order account's real lamport balance: shows the escrow on-chain, not just the stored prices.
function useBalance(order: Order) {
   const { connection } = useConnection();
   const [balance, setBalance] = useState<bigint | null>(null);
   const key = order.address.toBase58();
   useEffect(() => {
      connection
         .getBalance(order.address)
         .then((b) => setBalance(BigInt(b)))
         .catch(() => setBalance(null));
      // re-read whenever the status changes (e.g. after payment or payout)
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [connection, key, order.status]);
   return balance;
}
