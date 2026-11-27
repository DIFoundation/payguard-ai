import type { Abi, Address, Hex, PublicClient, WalletClient } from "viem";
import { REGISTRY_ADDRESS } from "@/constants/app";
import { settlementAbi } from "./settlementAbi";
import { erc20Abi, registryAbi } from "./wagmi";
import { qdayChain } from "./chains";
import type { SettleDeps } from "./settlePayment";
import type { AgentDeps } from "@/lib/agent/agentSettle";

/** Minimal write function so wagmi's heavily generic `writeContractAsync` can be passed in. */
export type WriteContractFn = (args: {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}) => Promise<Hex>;

/** Human path: the connected wallet approves (exact amount) and settles. */
export function buildSettleDeps(
  publicClient: PublicClient,
  write: WriteContractFn,
  settlement: Address,
): SettleDeps {
  return {
    settlement,
    checkRequest: async (req, signature, payer) => {
      const [status, hash] = await publicClient.readContract({
        address: settlement,
        abi: settlementAbi,
        functionName: "checkRequest",
        args: [req, signature, payer],
      });
      return { status, hash };
    },
    allowance: (token, owner, spender) =>
      publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, spender],
      }),
    approve: (token, spender, amount) =>
      write({ address: token, abi: erc20Abi as Abi, functionName: "approve", args: [spender, amount] }),
    settle: (req, signature) =>
      write({
        address: settlement,
        abi: settlementAbi as Abi,
        functionName: "settle",
        args: [req, signature],
      }),
    waitForReceipt: (hash) => publicClient.waitForTransactionReceipt({ hash }),
  };
}

/** Agent path: the agent's own wallet client signs `settleAsAgent`. */
export function buildAgentDeps(
  publicClient: PublicClient,
  agentWallet: WalletClient,
  settlement: Address,
): AgentDeps {
  const agent = agentWallet.account!.address;
  return {
    settlement,
    agent,
    readPolicy: async (owner, who) => {
      const [p, u] = await Promise.all([
        publicClient.readContract({
          address: settlement,
          abi: settlementAbi,
          functionName: "policies",
          args: [owner, who],
        }),
        publicClient.readContract({
          address: settlement,
          abi: settlementAbi,
          functionName: "usage",
          args: [owner, who],
        }),
      ]);
      return {
        policy: {
          token: p[0],
          perTxCap: p[1],
          dailyCap: p[2],
          expiry: p[3],
          registeredOnly: p[4],
          active: p[5],
        },
        usage: { windowStart: u[0], spent: u[1] },
      };
    },
    isRegistered: async (wallet) => {
      if (!REGISTRY_ADDRESS) return false;
      return publicClient.readContract({
        address: REGISTRY_ADDRESS,
        abi: registryAbi,
        functionName: "isRegistered",
        args: [wallet],
      }) as Promise<boolean>;
    },
    checkRequest: async (req, signature, payer) => {
      const [status, hash] = await publicClient.readContract({
        address: settlement,
        abi: settlementAbi,
        functionName: "checkRequest",
        args: [req, signature, payer],
      });
      return { status, hash };
    },
    allowance: (token, owner, spender) =>
      publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, spender],
      }),
    settleAsAgent: (owner, req, signature) =>
      agentWallet.writeContract({
        address: settlement,
        abi: settlementAbi,
        functionName: "settleAsAgent",
        args: [owner, req, signature],
        account: agentWallet.account!,
        chain: qdayChain,
      }),
    waitForReceipt: (hash) => publicClient.waitForTransactionReceipt({ hash }),
    nowSec: () => BigInt(Math.floor(Date.now() / 1000)),
  };
}
