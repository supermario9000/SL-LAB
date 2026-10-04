import type { PublicKey } from "@solana/web3.js";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { useProgram } from "../hooks/useProgram";
import { useTx } from "../hooks/useTx";
import { createOrder } from "../lib/contract";
import { formatSol } from "../lib/format";
import { rolesFor } from "../lib/permissions";
import { STATUS_INFO } from "../lib/status";
import type { Agreement, Order } from "../lib/types";

interface Props {
   agreement: Agreement;
   orders: Order[];
   loading: boolean;
   selected: PublicKey | null;
   onSelect: (o: Order) => void;
   onChanged: () => void;
}

export function OrderList({ agreement, orders, loading, selected, onSelect, onChanged }: Props) {
   const wallet = useAnchorWallet();
   const program = useProgram();
   const { run, pending } = useTx();
   if (!wallet || !program) return null;

   const isProvider = rolesFor(wallet.publicKey, agreement).includes("provider");

   return (
      <section className="card">
         <div className="row">
            <h2>Orders</h2>
            {isProvider && (
               <button
                  disabled={!!pending || !agreement.accepted}
                  title={agreement.accepted ? "" : "The client must accept the agreement first"}
                  onClick={async () => {
                     if (await run("Register order", () => createOrder(program, agreement))) onChanged();
                  }}
               >
                  + Register order
               </button>
            )}
         </div>
         {orders.length === 0 && (
            <p className="muted">{loading ? "Loading…" : "No orders under this agreement yet."}</p>
         )}
         <table className="table">
            {orders.length > 0 && (
               <thead>
                  <tr>
                     <th>#</th>
                     <th>Status</th>
                     <th>Total</th>
                  </tr>
               </thead>
            )}
            <tbody>
               {orders.map((o) => (
                  <tr
                     key={o.address.toBase58()}
                     className={selected?.equals(o.address) ? "selected" : ""}
                     onClick={() => onSelect(o)}
                  >
                     <td>{o.orderId.toString()}</td>
                     <td>
                        <span className={`pill status-${o.status.toLowerCase()}`}>
                           {STATUS_INFO[o.status].label}
                        </span>
                     </td>
                     <td>{formatSol(o.fulfillmentPrice + o.shipmentPrice)}</td>
                  </tr>
               ))}
            </tbody>
         </table>
      </section>
   );
}
