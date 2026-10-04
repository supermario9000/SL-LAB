import { PublicKey } from "@solana/web3.js";
import idl from "./idl/chaind_logistics.json";

// Which Solana network the UI talks to. Explorer links use the same cluster.
export const CLUSTER = "devnet";
export const RPC_URL: string =
   import.meta.env.VITE_RPC_URL ?? "https://api.devnet.solana.com";

// MIRRORS: lib.rs declare_id! / Anchor.toml [programs.devnet]. Taken from the IDL's "address";
// set VITE_PROGRAM_ID in frontend/.env to point at a different deployment.
export const PROGRAM_ID = new PublicKey(
   import.meta.env.VITE_PROGRAM_ID ?? idl.address,
);

// MIRRORS: constants.rs MIN_DELIVERY_TIMEOUT / MAX_DELIVERY_TIMEOUT (seconds).
export const MIN_DELIVERY_TIMEOUT_SECS = 1;
export const MAX_DELIVERY_TIMEOUT_SECS = 90 * 24 * 60 * 60;

// How often the UI re-reads accounts from the chain (account state is the source of truth).
export const REFRESH_MS = 10_000;
