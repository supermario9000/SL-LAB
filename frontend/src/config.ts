import { PublicKey, clusterApiUrl } from "@solana/web3.js";
import idl from "./idl/chaind_logistics.json";

// DEVNET ONLY. This app is a proof of concept and must never touch mainnet or real funds.
// The cluster is fixed here, and <DevnetGuard> refuses to render the app unless the RPC
// endpoint really is devnet (checked by its genesis hash, see src/lib/network.ts).
export const CLUSTER = "devnet" as const;
export const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

// VITE_RPC_URL may point at another DEVNET provider (e.g. a dedicated devnet RPC if the public
// one rate-limits during a demo). A non-devnet URL is rejected at runtime by <DevnetGuard>.
export const RPC_URL: string =
   import.meta.env.VITE_RPC_URL ?? clusterApiUrl(CLUSTER);

// MIRRORS: lib.rs declare_id! / Anchor.toml [programs.devnet]. Taken from the IDL's "address";
// set VITE_PROGRAM_ID in frontend/.env to point at a different devnet deployment.
export const PROGRAM_ID = new PublicKey(
   import.meta.env.VITE_PROGRAM_ID ?? idl.address,
);

// MIRRORS: constants.rs MIN_DELIVERY_TIMEOUT / MAX_DELIVERY_TIMEOUT (seconds).
export const MIN_DELIVERY_TIMEOUT_SECS = 1;
export const MAX_DELIVERY_TIMEOUT_SECS = 90 * 24 * 60 * 60;

// How often the UI re-reads accounts from the chain (account state is the source of truth).
export const REFRESH_MS = 10_000;
