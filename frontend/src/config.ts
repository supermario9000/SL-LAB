import { PublicKey } from "@solana/web3.js";
import idl from "./idl/fulfillment.json";

// Which Solana network the UI talks to. Explorer links use the same cluster.
export const CLUSTER = "devnet";
export const RPC_URL: string =
   import.meta.env.VITE_RPC_URL ?? "https://api.devnet.solana.com";

// BACKEND-DEPENDENT: the program id. By default it is the "address" field of the synced IDL
// (written by `anchor keys sync` + `anchor build`). Set VITE_PROGRAM_ID in frontend/.env to override.
export const PROGRAM_ID = new PublicKey(
   import.meta.env.VITE_PROGRAM_ID ?? idl.address,
);

// True while src/idl/fulfillment.json is still the hand-written placeholder.
export const USING_PLACEHOLDER_IDL =
   PROGRAM_ID.toBase58() === "P1aceho1der11111111111111111111111111111111";

// How often the UI re-reads accounts from the chain (account state is the source of truth).
export const REFRESH_MS = 10_000;
