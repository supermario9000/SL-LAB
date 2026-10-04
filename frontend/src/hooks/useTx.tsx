import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { describeError } from "../lib/contract";

// Keeps a log of every transaction the UI sends, so each one gets an explorer link
// (AGENTS.md: "an explorer link for every transaction").

export interface TxEntry {
   id: number;
   label: string;
   status: "pending" | "ok" | "error";
   signature?: string;
   error?: string;
   at: Date;
}

interface TxContextValue {
   entries: TxEntry[];
   pending: string | null; // label of the transaction currently in flight
   // Runs `send` (which must return a signature). Resolves to true on success.
   run: (label: string, send: () => Promise<string>) => Promise<boolean>;
}

const TxContext = createContext<TxContextValue | null>(null);

let nextId = 1;

export function TxProvider({ children }: { children: ReactNode }) {
   const [entries, setEntries] = useState<TxEntry[]>([]);
   const [pending, setPending] = useState<string | null>(null);

   const run = useCallback(
      async (label: string, send: () => Promise<string>) => {
         const id = nextId++;
         const update = (patch: Partial<TxEntry>) =>
            setEntries((list) =>
               list.map((e) => (e.id === id ? { ...e, ...patch } : e)),
            );
         setEntries((list) => [
            { id, label, status: "pending", at: new Date() },
            ...list,
         ]);
         setPending(label);
         try {
            const signature = await send();
            update({ status: "ok", signature });
            return true;
         } catch (err) {
            console.error(label, err);
            // `sendAndConfirm` (lib/contract.ts) attaches the signature to its errors even on
            // failure, so the log can still link to the Explorer (AGENTS.md: every transaction).
            const signature = (err as { signature?: string })?.signature;
            update({ status: "error", error: describeError(err), signature });
            return false;
         } finally {
            setPending(null);
         }
      },
      [],
   );

   return (
      <TxContext.Provider value={{ entries, pending, run }}>
         {children}
      </TxContext.Provider>
   );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTx() {
   const ctx = useContext(TxContext);
   if (!ctx) throw new Error("useTx must be used inside <TxProvider>");
   return ctx;
}
