import { useState } from "react";
import {
   ConnectionProvider,
   WalletProvider,
   useAnchorWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./App.css";
import { RPC_URL } from "./config";
import { useAgreements, useOrders } from "./hooks/useChainData";
import { TxProvider } from "./hooks/useTx";
import { AgreementPanel } from "./components/AgreementPanel";
import { Header } from "./components/Header";
import { OrderDetail } from "./components/OrderDetail";
import { OrderList } from "./components/OrderList";
import { TxLog } from "./components/TxLog";

// Wallets: an empty list is enough because Phantom, Solflare, Backpack, etc. register
// themselves through the Wallet Standard.
export default function App() {
   return (
      <ConnectionProvider endpoint={RPC_URL}>
         <WalletProvider wallets={[]} autoConnect>
            <WalletModalProvider>
               <TxProvider>
                  <main className="app">
                     <Header />
                     <Dashboard />
                     <TxLog />
                  </main>
               </TxProvider>
            </WalletModalProvider>
         </WalletProvider>
      </ConnectionProvider>
   );
}

function Dashboard() {
   const wallet = useAnchorWallet();
   const agreements = useAgreements();
   // Selections are stored as base58 strings and looked up in the freshly polled lists,
   // so the selected agreement/order always shows the latest on-chain data.
   const [agreementKey, setAgreementKey] = useState<string | null>(null);
   const [orderKey, setOrderKey] = useState<string | null>(null);

   const agreement =
      agreements.data.find((a) => a.address.toBase58() === agreementKey) ??
      agreements.data[0] ??
      null;
   const orders = useOrders(agreement?.address ?? null);
   const order = orders.data.find((o) => o.address.toBase58() === orderKey) ?? null;

   if (!wallet) {
      return (
         <section className="card">
            <h2>Connect your wallet</h2>
            <p className="muted">
               Connect a devnet wallet to see the agreements and orders you are part of as a 3PL, a client
               or a courier. Need test SOL? Use <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a>.
            </p>
         </section>
      );
   }

   const refreshAll = () => {
      agreements.refresh();
      orders.refresh();
   };

   return (
      <div className="grid">
         <div>
            <AgreementPanel
               agreements={agreements.data}
               selected={agreement?.address ?? null}
               onSelect={(a) => {
                  setAgreementKey(a.address.toBase58());
                  setOrderKey(null);
               }}
               onChanged={refreshAll}
            />
            {agreements.error && <p className="error">Could not load agreements: {agreements.error}</p>}
         </div>
         <div>
            {agreement && (
               <OrderList
                  agreement={agreement}
                  orders={orders.data}
                  loading={orders.loading}
                  selected={order?.address ?? null}
                  onSelect={(o) => setOrderKey(o.address.toBase58())}
                  onChanged={refreshAll}
               />
            )}
            {orders.error && <p className="error">Could not load orders: {orders.error}</p>}
            {agreement && order && (
               <OrderDetail agreement={agreement} order={order} onChanged={refreshAll} />
            )}
         </div>
      </div>
   );
}
