"use client";

import { useState } from "react";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { keccak256, stringToHex, type Address } from "viem";
import { CheckCircle2, Landmark, Loader2, ShieldOff, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePayGuardWallet } from "@/hooks/usePayGuardWallet";
import { registryAbi } from "@/lib/blockchain/wagmi";
import { REGISTRY_ADDRESS, QDAY, explorerTxUrl } from "@/constants/app";

/** Lets the connected wallet register/revoke itself on PayGuardRegistry. */
export function RegisterCard() {
  const wallet = usePayGuardWallet();
  const [profileLabel, setProfileLabel] = useState("");
  const [pendingAction, setPendingAction] = useState<"register" | "revoke" | null>(null);

  const statusQuery = useReadContract({
    address: REGISTRY_ADDRESS || undefined,
    abi: registryAbi,
    functionName: "isRegistered",
    args: wallet.address ? [wallet.address] : undefined,
    chainId: QDAY.chainId,
    query: { enabled: !!REGISTRY_ADDRESS && !!wallet.address && wallet.onCorrectChain },
  });

  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading: confirming } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: QDAY.chainId,
  });

  const registered = statusQuery.data as boolean | undefined;
  const registryMissing = !REGISTRY_ADDRESS;

  const act = (action: "register" | "revoke") => {
    if (!wallet.address) return;
    setPendingAction(action);
    const profileHash = keccak256(
      stringToHex(`${wallet.address}|${profileLabel}|payguard-ai`),
    );
    writeContract(
      action === "register"
        ? {
            address: REGISTRY_ADDRESS as Address,
            abi: registryAbi,
            functionName: "registerRecipient",
            args: [profileHash],
            chainId: QDAY.chainId,
          }
        : {
            address: REGISTRY_ADDRESS as Address,
            abi: registryAbi,
            functionName: "revokeRegistration",
            chainId: QDAY.chainId,
          },
      {
        onSettled: () => {
          setPendingAction(null);
          statusQuery.refetch();
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Your PayGuard registration</CardTitle>
          {registered !== undefined && !registryMissing && (
            <Badge variant={registered ? "verified" : "default"}>
              {registered ? "Registered" : "Not registered"}
            </Badge>
          )}
        </div>
        <CardDescription>
          Registering marks this wallet as an opted-in PayGuard recipient on-chain. It proves wallet
          control — not legal identity — and never involves funds.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {registryMissing && (
          <p className="rounded-lg border border-caution-500/30 bg-caution-500/10 p-3 text-sm text-caution-400">
            No registry contract configured. Set NEXT_PUBLIC_PAYGUARD_REGISTRY after deploying
            PayGuardRegistry to QDay Aevum.
          </p>
        )}
        {!wallet.isConnected && (
          <p className="text-sm text-slate-400">Connect your wallet to manage registration.</p>
        )}
        {wallet.isConnected && !wallet.onCorrectChain && registryMissing === false && (
          <p className="text-sm text-caution-400">Switch to {QDAY.name} to continue.</p>
        )}
        {wallet.isConnected && wallet.onCorrectChain && !registryMissing && (
          <>
            {!registered && (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-slate-300">Profile label (hashed on-chain, stored off-chain)</span>
                <input
                  value={profileLabel}
                  onChange={(e) => setProfileLabel(e.target.value)}
                  placeholder="e.g. studio-name / invoice handle"
                  className="h-10 rounded-lg border border-slate-700 bg-navy-950/60 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                />
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              {!registered ? (
                <Button onClick={() => act("register")} disabled={pendingAction !== null || confirming}>
                  {pendingAction === "register" || confirming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Register this wallet
                </Button>
              ) : (
                <Button variant="danger" onClick={() => act("revoke")} disabled={pendingAction !== null || confirming}>
                  {pendingAction === "revoke" || confirming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldOff className="h-4 w-4" />
                  )}
                  Revoke registration
                </Button>
              )}
            </div>
            {txHash && (
              <a
                href={explorerTxUrl(txHash)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary-300 hover:underline"
              >
                <Landmark className="h-3 w-3" /> View transaction {txHash.slice(0, 14)}…
              </a>
            )}
            {registered && (
              <p className="flex items-center gap-1.5 text-xs text-verified-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Payers will see REGISTERED RECIPIENT for this wallet.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
