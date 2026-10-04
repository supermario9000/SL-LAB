import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
import { PROGRAM_ID } from "../config";

// Program Derived Addresses: account addresses computed from fixed "seeds", so the UI can
// find an agreement or order without storing its address anywhere.

// MIRRORS: init_agreement.rs seeds ["agreement", provider, client]
export const agreementPda = (provider: PublicKey, client: PublicKey) =>
   PublicKey.findProgramAddressSync(
      [Buffer.from("agreement"), provider.toBuffer(), client.toBuffer()],
      PROGRAM_ID,
   )[0];

// MIRRORS: create_order.rs seeds ["order", agreement, order_id.to_le_bytes()]
export const orderPda = (agreement: PublicKey, orderId: bigint) => {
   const id = new Uint8Array(8);
   new DataView(id.buffer).setBigUint64(0, orderId, true); // true = little-endian
   return PublicKey.findProgramAddressSync(
      [Buffer.from("order"), agreement.toBuffer(), id],
      PROGRAM_ID,
   )[0];
};
