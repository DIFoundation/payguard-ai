"use client";

import { useMemo, useState } from "react";
import { useBalance, usePublicClient, useSendTransaction } from "wagmi";
import { formatEther, isAddress, parseEther, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Bot, KeyRound, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePayGuardWallet } from "@/hooks/usePayGuardWallet";
import { QDAY, SETTLEMENT_ADDRESS } from "@/constants/app";
import { shortAddress } from "@/lib/utils";
import { PolicyCard } from "./PolicyCard";
import { AgentRunnerCard } from "./AgentRunnerCard";
import { AuditTrail } from "./AuditTrail";

const GAS_TOP_UP = "0.001";

/** Agent mode: grant a bounded, revocable permission, let an agent pay within it, audit on-chain. */
export function AgentClient() {
  const wallet = usePayGuardWallet();
  const publicClient = usePublicClient({ chainId: QDAY.chainId });
  const { sendTransactionAsync } = useSendTransaction();

  // The demo agent key lives in memory only. It is never written to browser storage.
  const [agentPk, setAgentPk] = useState<Hex | null>(null);
  const [agentInput, setAgentInput] = useState("");
  const [funding, setFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  const [auditKey, setAuditKey] = useState(0);

  const agentAccount = useMemo(() => (agentPk ? privateKeyToAccount(agentPk) : null), [agentPk]);
  const agentBalance = useBalance({
    address: agentAccount?.address,
    chainId: QDAY.chainId,
    query: { enabled: !!agentAccount, refetchInterval: 10_000 },
  });

  if (!SETTLEMENT_ADDRESS || !isAddress(SETTLEMENT_ADDRESS)) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 py-6 text-sm text-caution-400">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          PayGuardSettlement is not configured. Set NEXT_PUBLIC_PAYGUARD_SETTLEMENT in your environment.
        </CardContent>
      </Card>
    );
  }
  if (!wallet.isConnected || !wallet.address) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-slate-400">
          Connect the wallet that owns the funds. It will grant the agent its permission.
        </CardContent>
      </Card>
    );
  }
  if (!wallet.onCorrectChain) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-6 text-sm text-caution-400">
          Switch to QDay Aevum Testnet to manage agents.
          <Button size="sm" onClick={wallet.switchChain} disabled={wallet.isSwitching}>
            Switch network
          </Button>
        </CardContent>
      </Card>
    );
  }

  const owner = wallet.address as Address;
  const settlement = SETTLEMENT_ADDRESS as Address;

  const generateAgent = () => {
    const pk = generatePrivateKey();
    setAgentPk(pk);
    setAgentInput(privateKeyToAccount(pk).address);
  };

  const forgetAgent = () => {
    setAgentPk(null);
    setAgentInput("");
  };

  const fundAgent = async () => {
    if (!agentAccount || !publicClient) return;
    setFunding(true);
    setFundError(null);
    try {
      const hash = await sendTransactionAsync({
        to: agentAccount.address,
        value: parseEther(GAS_TOP_UP),
        chainId: QDAY.chainId,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      agentBalance.refetch();
    } catch (e) {
      setFundError(e instanceof Error ? e.message.slice(0, 160) : "Funding failed.");
    } finally {
      setFunding(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary-400" /> Demo agent
            <Badge variant="caution">testnet only</Badge>
          </CardTitle>
          <CardDescription>
            A throwaway key generated in this browser tab. It is held in memory only and disappears when you
            refresh. In production an agent runs in its own service, never in your browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {agentAccount ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <KeyRound className="h-4 w-4 text-slate-500" />
                <span className="font-mono text-slate-200" title={agentAccount.address}>
                  {shortAddress(agentAccount.address)}
                </span>
                <Badge variant="default">
                  {agentBalance.data ? `${Number(formatEther(agentBalance.data.value)).toFixed(4)} tQDAY` : "…"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={fundAgent} disabled={funding}>
                  {funding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Send {GAS_TOP_UP} tQDAY for gas
                </Button>
                <Button size="sm" variant="ghost" onClick={forgetAgent}>
                  <Trash2 className="h-3.5 w-3.5" /> Forget agent
                </Button>
              </div>
              {fundError && <p className="text-xs text-danger-400">{fundError}</p>}
              <p className="text-xs text-slate-500">
                The agent holds no tUSD8. It can only move your tokens through the settlement contract, and only
                within the limits you set below.
              </p>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={generateAgent}>
                Generate demo agent
              </Button>
              <span className="text-xs text-slate-500">
                Or paste any agent wallet address in the permission form below.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <PolicyCard
        owner={owner}
        settlement={settlement}
        agentInput={agentInput}
        onAgentInputChange={setAgentInput}
        onChanged={() => setAuditKey((k) => k + 1)}
      />

      <AgentRunnerCard
        owner={owner}
        settlement={settlement}
        agentAccount={agentAccount}
        onChanged={() => {
          setAuditKey((k) => k + 1);
          wallet.refetchBalances();
        }}
      />

      <AuditTrail owner={owner} settlement={settlement} refreshKey={auditKey} />
    </div>
  );
}
