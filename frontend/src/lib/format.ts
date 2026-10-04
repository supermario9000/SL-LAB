import type { PublicKey } from "@solana/web3.js";
import { CLUSTER } from "../config";

export const LAMPORTS_PER_SOL = 1_000_000_000n;

// Lamports are kept as bigint everywhere so large amounts never lose precision.
export function formatSol(lamports: bigint): string {
   const whole = lamports / LAMPORTS_PER_SOL;
   const frac = (lamports % LAMPORTS_PER_SOL)
      .toString()
      .padStart(9, "0")
      .replace(/0+$/, "");
   return `${whole}${frac ? "." + frac : ""} SOL`;
}

// Parses user input like "0.25" into lamports without floating point rounding.
export function parseSol(input: string): bigint {
   const trimmed = input.trim();
   if (!/^\d+(\.\d{0,9})?$/.test(trimmed)) {
      throw new Error(`"${input}" is not a valid SOL amount (max 9 decimals)`);
   }
   const [whole, frac = ""] = trimmed.split(".");
   return BigInt(whole) * LAMPORTS_PER_SOL + BigInt(frac.padEnd(9, "0"));
}

export function shortAddress(key: PublicKey | string): string {
   const s = typeof key === "string" ? key : key.toBase58();
   return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export function explorerTx(signature: string): string {
   return `https://explorer.solana.com/tx/${signature}?cluster=${CLUSTER}`;
}

export function explorerAddress(key: PublicKey | string): string {
   const s = typeof key === "string" ? key : key.toBase58();
   return `https://explorer.solana.com/address/${s}?cluster=${CLUSTER}`;
}

export function formatDate(unixSecs: number): string {
   return new Date(unixSecs * 1000).toLocaleString();
}

export function formatDuration(secs: number): string {
   if (secs <= 0) return "0s";
   const d = Math.floor(secs / 86400);
   const h = Math.floor((secs % 86400) / 3600);
   const m = Math.floor((secs % 3600) / 60);
   const s = Math.floor(secs % 60);
   return (
      [d && `${d}d`, h && `${h}h`, m && `${m}m`, !d && !h && s && `${s}s`]
         .filter(Boolean)
         .join(" ") || "0s"
   );
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
   const digest = await crypto.subtle.digest("SHA-256", data);
   return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
}

export function hexToBytes(hex: string): number[] {
   return hex.match(/../g)?.map((b) => parseInt(b, 16)) ?? [];
}
