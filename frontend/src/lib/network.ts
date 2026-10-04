import type { Connection } from "@solana/web3.js";
import { DEVNET_GENESIS_HASH } from "../config";

export type NetworkStatus = "devnet" | "wrong-network" | "unreachable";

// Every Solana cluster has a unique genesis hash, so this tells devnet apart from mainnet or
// testnet no matter what the RPC URL looks like.
export async function checkNetwork(connection: Connection): Promise<NetworkStatus> {
   try {
      const hash = await connection.getGenesisHash();
      return hash === DEVNET_GENESIS_HASH ? "devnet" : "wrong-network";
   } catch {
      return "unreachable";
   }
}
