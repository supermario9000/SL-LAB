import { useMemo } from "react";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import idl from "../idl/chaind_logistics.json";
import { PROGRAM_ID } from "../config";

// Returns an Anchor `Program` client bound to the connected wallet, or null when no wallet
// is connected. Every transaction it sends is signed by that wallet.
//
// The program is typed as a generic `Idl`. For autocompletion you can copy the generated
// `target/types/chaind_logistics.ts` into src/idl/ and use `Program<ChaindLogistics>`.
export function useProgram(): Program | null {
   const { connection } = useConnection();
   const wallet = useAnchorWallet();

   return useMemo(() => {
      if (!wallet) return null;
      const provider = new AnchorProvider(connection, wallet, {
         commitment: "confirmed",
      });
      return new Program(
         { ...(idl as Idl), address: PROGRAM_ID.toBase58() },
         provider,
      );
   }, [connection, wallet]);
}
