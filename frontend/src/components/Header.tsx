import { useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { CLUSTER, PROGRAM_ID } from "../config";
import { useProgram } from "../hooks/useProgram";
import { checkDeployment, type DeploymentStatus } from "../lib/contract";
import { explorerAddress, shortAddress } from "../lib/format";

export function Header() {
   const program = useProgram();
   const [status, setStatus] = useState<DeploymentStatus | null>(null);

   // Runs once a wallet is connected (the check simulates a call with it as fee payer).
   useEffect(() => {
      if (!program) return;
      let cancelled = false;
      checkDeployment(program).then((s) => !cancelled && setStatus(s));
      return () => {
         cancelled = true;
      };
   }, [program]);

   return (
      <header className="header">
         <div>
            <h1>
               Trustless Order Fulfillment <span className="pill warn">Devnet only · proof of concept</span>
            </h1>
            <p className="muted">
               Escrowed 3PL + courier payments on Solana {CLUSTER}, with free test SOL (no real value). Program{" "}
               <a href={explorerAddress(PROGRAM_ID)} target="_blank" rel="noreferrer" className="mono">
                  {shortAddress(PROGRAM_ID)}
               </a>
            </p>
         </div>
         <WalletMultiButton />
         {program && status === "missing" && (
            <div className="banner warn">
               No program is deployed at {PROGRAM_ID.toBase58()} on {CLUSTER}.
            </div>
         )}
         {program && status === "wrong-build" && (
            <div className="banner warn">
               The program at {PROGRAM_ID.toBase58()} was built for a different program id, so it rejects
               every transaction. Rebuild with the matching <code>declare_id!</code> and redeploy, or set{" "}
               <code>VITE_PROGRAM_ID</code> in <code>frontend/.env</code> to a correctly built deployment.
            </div>
         )}
      </header>
   );
}
