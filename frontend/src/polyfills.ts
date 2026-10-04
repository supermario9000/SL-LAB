import { Buffer } from "buffer";

// @solana/web3.js and Anchor expect Node's global `Buffer`, which browsers don't have.
// Imported first in main.tsx so it runs before any Solana code.
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
