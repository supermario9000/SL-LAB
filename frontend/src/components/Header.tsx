import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { CLUSTER, PROGRAM_ID, USING_PLACEHOLDER_IDL } from "../config";
import { programIsDeployed } from "../lib/contract";
import { explorerAddress, shortAddress } from "../lib/format";

export function Header() {
   const { connection } = useConnection();
   const [deployed, setDeployed] = useState<boolean | null>(null);

   useEffect(() => {
      programIsDeployed(connection)
         .then(setDeployed)
         .catch(() => setDeployed(false));
   }, [connection]);

   return (
      <header className="header">
         <div>
            <h1>Trustless Order Fulfillment</h1>
            <p className="muted">
               Escrowed 3PL + courier payments on Solana {CLUSTER}. Program{" "}
               <a href={explorerAddress(PROGRAM_ID)} target="_blank" rel="noreferrer" className="mono">
                  {shortAddress(PROGRAM_ID)}
               </a>
            </p>
         </div>
         <WalletMultiButton />
         {USING_PLACEHOLDER_IDL && (
            <div className="banner warn">
               Using the placeholder IDL. Copy the real one to <code>frontend/src/idl/fulfillment.json</code>{" "}
               after <code>anchor build</code>.
            </div>
         )}
         {!USING_PLACEHOLDER_IDL && deployed === false && (
            <div className="banner warn">
               No program is deployed at this address on {CLUSTER}.
            </div>
         )}
      </header>
   );
}
