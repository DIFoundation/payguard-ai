"use client";

import { useAccount, useBalance, useChainId, useReadContract, useSwitchChain } from "wagmi";
import { erc20Abi, TUSD8 } from "@/lib/blockchain/wagmi";
import { QDAY } from "@/constants/app";

/** Combined wallet state used across PayGuard features. */
export function usePayGuardWallet() {
  const { address, isConnected, status } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const onCorrectChain = chainId === QDAY.chainId;

  const native = useBalance({
    address,
    query: { enabled: !!address },
  });

  const tokenBalanceQuery = useReadContract({
    address: TUSD8.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: QDAY.chainId,
    query: { enabled: !!address && onCorrectChain },
  });

  return {
    address,
    isConnected,
    status,
    chainId,
    onCorrectChain,
    isSwitching,
    switchChain: () => switchChain({ chainId: QDAY.chainId }),
    nativeBalance: native.data,
    tokenBalance: tokenBalanceQuery.data
      ? { value: tokenBalanceQuery.data as bigint, decimals: TUSD8.decimals, symbol: TUSD8.symbol }
      : undefined,
    refetchBalances: () => {
      native.refetch();
      tokenBalanceQuery.refetch();
    },
  };
}

export { erc20Abi };
