import { useCallback, useEffect, useState } from "react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import type { PublicKey } from "@solana/web3.js";
import { REFRESH_MS } from "../config";
import { describeError, fetchAgreements, fetchOrders } from "../lib/contract";
import type { Agreement, Order } from "../lib/types";
import { useProgram } from "./useProgram";

// Generic "load something from the chain, and reload it every REFRESH_MS" hook.
// Results are tagged with the loader that produced them, so switching to another agreement
// never shows the previous agreement's orders while the new ones load.
function usePolled<T>(load: (() => Promise<T>) | null, initial: T) {
   const [result, setResult] = useState<{ from: unknown; data: T } | null>(null);
   const [error, setError] = useState<string | null>(null);

   // Manual reload, called after a transaction succeeds.
   const refresh = useCallback(async () => {
      if (!load) return;
      try {
         setResult({ from: load, data: await load() });
         setError(null);
      } catch (err) {
         setError(describeError(err));
      }
   }, [load]);

   useEffect(() => {
      if (!load) return;
      let cancelled = false; // ignore responses that arrive after the loader changed
      const tick = () =>
         load().then(
            (data) => {
               if (cancelled) return;
               setResult({ from: load, data });
               setError(null);
            },
            (err) => !cancelled && setError(describeError(err)),
         );
      tick();
      const timer = setInterval(tick, REFRESH_MS);
      return () => {
         cancelled = true;
         clearInterval(timer);
      };
   }, [load]);

   const fresh = load !== null && result?.from === load;
   return {
      data: fresh ? result.data : initial,
      error: load ? error : null,
      loading: load !== null && !fresh, // true only until the first load finishes
      refresh,
   };
}

// Agreements where the connected wallet is the 3PL, the client, or the courier.
export function useAgreements() {
   const program = useProgram();
   const wallet = useAnchorWallet();

   const load = useCallback(async () => {
      if (!program || !wallet) return [];
      const me = wallet.publicKey;
      const all = await fetchAgreements(program);
      return all.filter(
         (a) =>
            a.provider.equals(me) || a.client.equals(me) || a.courier.equals(me),
      );
   }, [program, wallet]);

   return usePolled<Agreement[]>(program ? load : null, []);
}

export function useOrders(agreement: PublicKey | null) {
   const program = useProgram();
   const key = agreement?.toBase58();

   const load = useCallback(
      async () => (program && agreement ? fetchOrders(program, agreement) : []),
      // `key` stands in for `agreement` so a new PublicKey object with the same value
      // doesn't trigger a reload.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [program, key],
   );

   return usePolled<Order[]>(program && agreement ? load : null, []);
}
