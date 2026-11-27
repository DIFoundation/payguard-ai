"use client";

import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { settlementAbi } from "@/lib/blockchain/settlementAbi";
import { erc20Abi } from "@/lib/blockchain/wagmi";
import { QDAY, SETTLEMENT_ADDRESS, TUSD8 } from "@/constants/app";
import type { AgentPolicy, AgentUsage } from "@/lib/agent/policy";

/** Live on-chain policy, usage window and the owner's token allowance for one owner/agent pair. */
export function useAgentPolicy(owner?: Address, agent?: Address) {
  const settlement = SETTLEMENT_ADDRESS as Address;
  const ready = !!SETTLEMENT_ADDRESS && !!owner && !!agent;

  const policyQ = useReadContract({
    address: settlement,
    abi: settlementAbi,
    functionName: "policies",
    args: owner && agent ? [owner, agent] : undefined,
    chainId: QDAY.chainId,
    query: { enabled: ready, refetchInterval: 10_000 },
  });
  const usageQ = useReadContract({
    address: settlement,
    abi: settlementAbi,
    functionName: "usage",
    args: owner && agent ? [owner, agent] : undefined,
    chainId: QDAY.chainId,
    query: { enabled: ready, refetchInterval: 10_000 },
  });
  const allowanceQ = useReadContract({
    address: TUSD8.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: owner ? [owner, settlement] : undefined,
    chainId: QDAY.chainId,
    query: { enabled: !!SETTLEMENT_ADDRESS && !!owner, refetchInterval: 10_000 },
  });

  const p = policyQ.data;
  const u = usageQ.data;
  const policy: AgentPolicy | undefined = p
    ? { token: p[0], perTxCap: p[1], dailyCap: p[2], expiry: p[3], registeredOnly: p[4], active: p[5] }
    : undefined;
  const usage: AgentUsage | undefined = u ? { windowStart: u[0], spent: u[1] } : undefined;

  return {
    policy,
    usage,
    allowance: allowanceQ.data as bigint | undefined,
    isLoading: policyQ.isLoading || usageQ.isLoading,
    refetch: () => {
      policyQ.refetch();
      usageQ.refetch();
      allowanceQ.refetch();
    },
  };
}
