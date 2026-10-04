import { useTx } from "../hooks/useTx";
import { explorerTx } from "../lib/format";

// Every transaction sent from this browser tab, newest first, each with an explorer link.
export function TxLog() {
   const { entries } = useTx();
   if (entries.length === 0) return null;
   return (
      <section className="card">
         <h2>Transactions</h2>
         <ul className="txlog">
            {entries.map((e) => (
               <li key={e.id} className={e.status}>
                  <span className="small muted">{e.at.toLocaleTimeString()}</span>{" "}
                  <strong>{e.label}</strong>{" "}
                  {e.status === "pending" && <span className="muted">pending…</span>}
                  {e.status === "ok" && e.signature && (
                     <a href={explorerTx(e.signature)} target="_blank" rel="noreferrer">
                        confirmed: view on Explorer ↗
                     </a>
                  )}
                  {e.status === "error" && (
                     <>
                        <span className="error">failed: {e.error}</span>{" "}
                        {e.signature && (
                           <a href={explorerTx(e.signature)} target="_blank" rel="noreferrer">
                              view on Explorer ↗
                           </a>
                        )}
                     </>
                  )}
               </li>
            ))}
         </ul>
      </section>
   );
}
