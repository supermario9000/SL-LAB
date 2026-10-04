import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { useProgram } from "../hooks/useProgram";
import { useTx } from "../hooks/useTx";
import { acceptAgreement, initAgreement } from "../lib/contract";
import { formatDuration } from "../lib/format";
import { ROLE_LABEL, rolesFor } from "../lib/permissions";
import type { Agreement } from "../lib/types";
import { Address } from "./Address";

interface Props {
   agreements: Agreement[];
   selected: PublicKey | null;
   onSelect: (a: Agreement) => void;
   onChanged: () => void;
}

// Left column: the agreements this wallet is part of, plus a form for a 3PL to create one.
export function AgreementPanel({ agreements, selected, onSelect, onChanged }: Props) {
   const wallet = useAnchorWallet();
   const program = useProgram();
   const { run, pending } = useTx();

   if (!wallet || !program) return null;

   return (
      <section className="card">
         <h2>Agreements</h2>
         {agreements.length === 0 && (
            <p className="muted">
               No agreements with this wallet yet. A 3PL creates one below, then the client accepts it.
            </p>
         )}
         <ul className="list">
            {agreements.map((a) => {
               const roles = rolesFor(wallet.publicKey, a);
               const isSelected = selected?.equals(a.address);
               return (
                  <li
                     key={a.address.toBase58()}
                     className={isSelected ? "selected" : ""}
                     onClick={() => onSelect(a)}
                  >
                     <div className="row">
                        <strong>
                           You are: {roles.map((r) => ROLE_LABEL[r]).join(" + ")}
                        </strong>
                        <span className={`pill ${a.accepted ? "ok" : "warn"}`}>
                           {a.accepted ? "Active" : "Awaiting client"}
                        </span>
                     </div>
                     <div className="small">
                        3PL <Address value={a.provider} /> · Client <Address value={a.client} /> · Courier{" "}
                        <Address value={a.courier} />
                     </div>
                     <div className="small muted">
                        Refund if not delivered within {formatDuration(a.deliveryTimeoutSecs)} of payment ·{" "}
                        {a.orderCount.toString()} order(s)
                     </div>
                     {!a.accepted && roles.includes("client") && (
                        <button
                           disabled={!!pending}
                           onClick={async (e) => {
                              e.stopPropagation();
                              if (await run("Accept agreement", () => acceptAgreement(program, a)))
                                 onChanged();
                           }}
                        >
                           Accept terms
                        </button>
                     )}
                  </li>
               );
            })}
         </ul>
         <NewAgreementForm onChanged={onChanged} />
      </section>
   );
}

function NewAgreementForm({ onChanged }: { onChanged: () => void }) {
   const program = useProgram();
   const { run, pending } = useTx();
   const [client, setClient] = useState("");
   const [courier, setCourier] = useState("");
   const [timeoutHours, setTimeoutHours] = useState("72");
   const [formError, setFormError] = useState<string | null>(null);

   async function submit(e: React.FormEvent) {
      e.preventDefault();
      if (!program) return;
      let clientKey: PublicKey, courierKey: PublicKey;
      try {
         clientKey = new PublicKey(client.trim());
         courierKey = new PublicKey(courier.trim());
      } catch {
         setFormError("Client and courier must be valid Solana addresses.");
         return;
      }
      const hours = Number(timeoutHours);
      if (!(hours > 0)) {
         setFormError("Delivery deadline must be a positive number of hours.");
         return;
      }
      setFormError(null);
      const ok = await run("Create agreement", () =>
         initAgreement(program, {
            client: clientKey,
            courier: courierKey,
            deliveryTimeoutSecs: Math.round(hours * 3600),
         }),
      );
      if (ok) onChanged();
   }

   return (
      <details className="sub">
         <summary>I'm a 3PL: create a new agreement</summary>
         <form onSubmit={submit} className="form">
            <label>
               Client wallet
               <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Client address" />
            </label>
            <label>
               Courier wallet
               <input value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="Courier address" />
            </label>
            <label>
               Delivery deadline after payment (hours)
               {/* BACKEND-DEPENDENT: the program may enforce min/max timeouts; for a live demo use a few minutes (e.g. 0.05). */}
               <input value={timeoutHours} onChange={(e) => setTimeoutHours(e.target.value)} />
            </label>
            {formError && <p className="error">{formError}</p>}
            <button type="submit" disabled={!!pending}>
               Create agreement
            </button>
         </form>
      </details>
   );
}
