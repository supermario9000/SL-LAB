import { useEffect, useState, type ReactNode } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { RPC_URL } from "../config";
import { checkNetwork, type NetworkStatus } from "../lib/network";

// Renders the app only after confirming the RPC endpoint is Solana devnet. On any other network
// (or if the RPC can't be reached) it shows a blocking message instead, so no transaction can be
// built or sent outside devnet.
export function DevnetGuard({ children }: { children: ReactNode }) {
   const { connection } = useConnection();
   const [status, setStatus] = useState<NetworkStatus | null>(null);
   const [attempt, setAttempt] = useState(0);

   useEffect(() => {
      let cancelled = false;
      checkNetwork(connection).then((s) => !cancelled && setStatus(s));
      return () => {
         cancelled = true;
      };
   }, [connection, attempt]);

   if (status === "devnet") return <>{children}</>;

   return (
      <section className="card">
         {status === null && <p className="muted">Checking that the RPC endpoint is Solana devnet…</p>}
         {status === "wrong-network" && (
            <>
               <h2>Devnet only</h2>
               <p className="error">
                  The RPC endpoint <code>{RPC_URL}</code> is not Solana devnet. This proof of concept only
                  runs on devnet, so it is disabled.
               </p>
               <p className="muted">
                  Remove <code>VITE_RPC_URL</code> from <code>frontend/.env</code> or set it to a devnet
                  endpoint, then restart <code>npm run dev</code>.
               </p>
            </>
         )}
         {status === "unreachable" && (
            <>
               <h2>Can't reach Solana devnet</h2>
               <p className="muted">
                  <code>{RPC_URL}</code> did not respond. Check your connection (or the RPC's rate limit).
               </p>
               <button
                  onClick={() => {
                     setStatus(null);
                     setAttempt((n) => n + 1);
                  }}
               >
                  Try again
               </button>
            </>
         )}
      </section>
   );
}
