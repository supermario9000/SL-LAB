import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { MAX_DELIVERY_TIMEOUT_SECS, MIN_DELIVERY_TIMEOUT_SECS } from "../config";
import { useProgram } from "../hooks/useProgram";
import { useTx } from "../hooks/useTx";
import { acceptAgreement, initAgreement } from "../lib/contract";
import { formatDuration } from "../lib/format";
import { agreementPda } from "../lib/pda";
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
                        {a.nextOrderId.toString()} order(s)
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
         <NewAgreementForm agreements={agreements} onChanged={onChanged} />
      </section>
   );
}

const UNIT_SECS = { minutes: 60, hours: 3600, days: 86400 } as const;

function NewAgreementForm({
   agreements,
   onChanged,
}: {
   agreements: Agreement[];
   onChanged: () => void;
}) {
   const wallet = useAnchorWallet();
   const program = useProgram();
   const { run, pending } = useTx();
   const [client, setClient] = useState("");
   const [courier, setCourier] = useState("");
   const [timeoutValue, setTimeoutValue] = useState("3");
   const [unit, setUnit] = useState<keyof typeof UNIT_SECS>("days");
   const [formError, setFormError] = useState<string | null>(null);

   async function submit(e: React.FormEvent) {
      e.preventDefault();
      if (!program || !wallet) return;
      let clientKey: PublicKey, courierKey: PublicKey;
      try {
         clientKey = new PublicKey(client.trim());
         courierKey = new PublicKey(courier.trim());
      } catch {
         setFormError("Client and courier must be valid Solana addresses.");
         return;
      }
      // The program checks all of these too (init_agreement.rs); checking here first gives a
      // clearer message and saves a failed transaction.
      const me = wallet.publicKey;
      if (clientKey.equals(me) || courierKey.equals(me) || clientKey.equals(courierKey)) {
         setFormError("3PL (you), client and courier must be three different wallets.");
         return;
      }
      if (agreements.some((a) => a.address.equals(agreementPda(me, clientKey)))) {
         setFormError("You already have an agreement with this client (one per 3PL + client pair).");
         return;
      }
      const secs = Math.round(Number(timeoutValue) * UNIT_SECS[unit]);
      if (!(secs >= MIN_DELIVERY_TIMEOUT_SECS && secs <= MAX_DELIVERY_TIMEOUT_SECS)) {
         setFormError("Delivery deadline must be between 1 second and 90 days.");
         return;
      }
      setFormError(null);
      const ok = await run("Create agreement", () =>
         initAgreement(program, {
            client: clientKey,
            courier: courierKey,
            deliveryTimeoutSecs: secs,
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
               Delivery deadline after payment (client can refund after this; max 90 days)
               <span className="row">
                  <input value={timeoutValue} onChange={(e) => setTimeoutValue(e.target.value)} />
                  <select value={unit} onChange={(e) => setUnit(e.target.value as keyof typeof UNIT_SECS)}>
                     <option value="minutes">minutes</option>
                     <option value="hours">hours</option>
                     <option value="days">days</option>
                  </select>
               </span>
            </label>
            {formError && <p className="error">{formError}</p>}
            <button type="submit" disabled={!!pending}>
               Create agreement
            </button>
         </form>
      </details>
   );
}
