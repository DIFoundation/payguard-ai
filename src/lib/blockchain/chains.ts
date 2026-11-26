import { defineChain } from "viem";
import { QDAY } from "@/constants/app";

export const qdayAevum = defineChain({
  id: QDAY.chainId,
  name: QDAY.name,
  nativeCurrency: { name: "tQDAY", symbol: "tQDAY", decimals: 18 },
  rpcUrls: { default: { http: [QDAY.rpcUrl] } },
  blockExplorers: {
    default: { name: "QDay Explorer", url: QDAY.explorerUrl },
  },
  testnet: true,
});

export const qdayChain = qdayAevum;
