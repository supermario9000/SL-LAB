import type { PublicKey } from "@solana/web3.js";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { explorerAddress, shortAddress } from "../lib/format";

// A shortened address that links to the explorer and says "(you)" for the connected wallet.
export function Address({ value }: { value: PublicKey }) {
   const wallet = useAnchorWallet();
   const isMe = wallet?.publicKey.equals(value);
   return (
      <a
         className="mono"
         href={explorerAddress(value)}
         target="_blank"
         rel="noreferrer"
         title={value.toBase58()}
      >
         {shortAddress(value)}
         {isMe && " (you)"}
      </a>
   );
}
