"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiAdapter, wagmiConfig } from "@/lib/blockchain/wagmi";
import { qdayAevum } from "@/lib/blockchain/chains";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/constants/app";
import { createAppKit } from "@reown/appkit/react";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

if (typeof window !== "undefined" && !projectId) {
  console.warn("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set.");
}

createAppKit({
  adapters: [wagmiAdapter],
  networks: [qdayAevum],
  projectId,
  metadata: {
    name: APP_NAME,
    description: `${APP_TAGLINE} ${APP_DESCRIPTION}`,
    url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    icons: [],
  },
  themeMode: "dark",
  features: {
    analytics: false,
    email: false,
    socials: false,
  },
  allowUnsupportedChain: false,
});

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
