import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { QDAY, TUSD8 } from "@/constants/app";
import { qdayAevum } from "./chains";

export { qdayAevum };

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

export const wagmiAdapter = new WagmiAdapter({
  networks: [qdayAevum],
  projectId,
  ssr: true,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

export const registryAbi = [
  {
    type: "function",
    name: "registerRecipient",
    stateMutability: "nonpayable",
    inputs: [{ name: "profileHash", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "revokeRegistration",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "isRegistered",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getRecipient",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [
      { name: "recipientWallet", type: "address" },
      { name: "profileHash", type: "bytes32" },
      { name: "registeredAt", type: "uint256" },
      { name: "active", type: "bool" },
    ],
  },
  {
    type: "event",
    name: "RecipientRegistered",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "profileHash", type: "bytes32", indexed: true },
      { name: "registeredAt", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RecipientRegistrationRevoked",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "revokedAt", type: "uint256", indexed: false },
    ],
  },
] as const;

export { TUSD8 };
export { QDAY };
