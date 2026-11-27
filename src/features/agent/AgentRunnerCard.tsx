"use client";

import { useMemo, useState } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { createWalletClient, formatUnits, http, type Address } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { AlertTriangle, Bot, CheckCircle2, Loader2, Swords, UserCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { settlementAbi } from "@/lib/blockchain/settlementAbi";
import { explainSettlementError, toContractRequest } from "@/lib/blockchain/settlement";
import { SettlementFlowError, requestData, settleSignedRequest } from "@/lib/blockchain/settlePayment";
import { buildAgentDeps, buildSettleDeps, type WriteContractFn } from "@/lib/blockchain/settleDeps";
import { qdayChain } from "@/lib/blockchain/chains";
import { AgentBlockedError, settleAsAgentFlow, type AgentStage } from "@/lib/agent/agentSettle";
import { tamperRequest, type TamperKind } from "@/lib/agent/attack";
import { decodeSignedRequest, isConfiguredSettlement } from "@/lib/signatures/paymentRequest";
import { QDAY, TUSD8, explorerTxUrl } from "@/constants/app";
import { shortAddress } from "@/lib/utils";

const STAGE_TEXT: Record<AgentStage, string> = {
  checking: "Checking policy and request…",
  sending: "Agent is sending the payment…",
  confirming: "Confirming on QDay Aevum…",
};

interface Props {
  owner: Address;
  settlement: Address;
  agentAccount: PrivateKeyAccount | null;
  onChanged: () => void;
}

type AttackState =
  | { state: "idle" }
  | { state: "running" }
  | { state: "unexpected" }
  | { state: "blocked"; message: string; txHash?: string; reverted?: boolean; broadcastError?: string };

/** The agent pays recipient-signed requests inside the owner's policy; the owner can step in. */
export function AgentRunnerCard({ owner, settlement, agentAccount, onChanged }: Props) {
  const publicClient = usePublicClient({ chainId: QDAY.chainId });
  const { writeContractAsync } = useWriteContract();

  const [requestRaw, setRequestRaw] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const [result, setResult] = useState<{ txHash: string; by: "agent" | "owner" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [escalation, setEscalation] = useState<{ code: string; message: string } | null>(null);
  const [attackKind, setAttackKind] = useState<TamperKind>("redirect-recipient");
  const [broadcast, setBroadcast] = useState(false);
  const [attack, setAttack] = useState<AttackState>({ state: "idle" });

  const request = useMemo(() => decodeSignedRequest(requestRaw), [requestRaw]);
  const agentWallet = useMemo(
    () =>
      agentAccount
        ? createWalletClient({ account: agentAccount, chain: qdayChain, transport: http(QDAY.rpcUrl) })
        : null,
    [agentAccount],
  );

  const wrongContract = !!request && !isConfiguredSettlement(request.verifyingContract);
  const canRun = !!publicClient && !!request && !wrongContract;

  const clearOutcome = () => {
    setResult(null);
    setError(null);
    setEscalation(null);
  };

  const runAgent = async () => {
    if (!publicClient || !agentWallet || !request) return;
    clearOutcome();
    setStage(STAGE_TEXT.checking);
    try {
      const deps = buildAgentDeps(publicClient, agentWallet, settlement);
      const res = await settleAsAgentFlow(deps, owner, request, (s) => setStage(STAGE_TEXT[s]));
      setResult({ txHash: res.txHash, by: "agent" });
      onChanged();
    } catch (e) {
      if (e instanceof AgentBlockedError && e.needsHuman) {
        setEscalation({ code: e.code, message: e.message });
      } else {
        setError(e instanceof SettlementFlowError ? e.message : explainSettlementError(e));
      }
    } finally {
      setStage(null);
    }
  };

  const approveAsOwner = async () => {
    if (!publicClient || !request) return;
    setError(null);
    setStage("Approve in your wallet…");
    try {
      const write: WriteContractFn = (a) =>
        writeContractAsync({ ...a, chainId: QDAY.chainId } as Parameters<typeof writeContractAsync>[0]);
      const res = await settleSignedRequest(buildSettleDeps(publicClient, write, settlement), request, owner, (s) =>
        setStage(s === "confirming" || s === "approval-confirming" ? "Confirming on QDay Aevum…" : "Approve in your wallet…"),
      );
      setEscalation(null);
      setResult({ txHash: res.txHash, by: "owner" });
      onChanged();
    } catch (e) {
      setError(e instanceof SettlementFlowError ? e.message : explainSettlementError(e));
    } finally {
      setStage(null);
    }
  };

  const runAttack = async () => {
    if (!publicClient || !agentAccount || !agentWallet || !request) return;
    setAttack({ state: "running" });
    const evil = tamperRequest(request, attackKind, agentAccount.address);
    const args = [owner, toContractRequest(requestData(evil)), evil.signature] as const;

    let message: string;
    try {
      await publicClient.simulateContract({
        account: agentAccount.address,
        address: settlement,
        abi: settlementAbi,
        functionName: "settleAsAgent",
        args,
      });
      // The contract would have ACCEPTED a tampered request. Never broadcast that.
      setAttack({ state: "unexpected" });
      return;
    } catch (e) {
      message = explainSettlementError(e);
    }
    if (!broadcast) {
      setAttack({ state: "blocked", message });
      return;
    }
    // Force the transaction out (explicit gas skips estimation) so the revert is visible on the explorer.
    try {
      const hash = await agentWallet.writeContract({
        address: settlement,
        abi: settlementAbi,
        functionName: "settleAsAgent",
        args,
        account: agentAccount,
        chain: qdayChain,
        gas: 500_000n,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setAttack({ state: "blocked", message, txHash: hash, reverted: receipt.status === "reverted" });
    } catch (e) {
      setAttack({
        state: "blocked",
        message,
        broadcastError: e instanceof Error ? e.message.slice(0, 160) : "Broadcast failed.",
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary-400" /> Agent payment
          </CardTitle>
          <CardDescription>
            Paste a request signed by the recipient. The agent pays it only if your on-chain policy allows it.
            Anything outside the limits goes back to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Textarea
            value={requestRaw}
            onChange={(e) => {
              setRequestRaw(e.target.value);
              clearOutcome();
              setAttack({ state: "idle" });
            }}
            placeholder='{"v":2,"recipient":"0x…",…}  (create one on the Create Request page)'
            spellCheck={false}
            className="min-h-28 font-mono text-xs"
          />

          {requestRaw.trim() && !request && (
            <p className="text-sm text-danger-400">This is not a valid PayGuard v2 signed request.</p>
          )}
          {wrongContract && (
            <p className="text-sm text-danger-400">
              This request was signed for a different settlement contract and can never be paid here.
            </p>
          )}

          {request && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-slate-800 bg-navy-950/50 p-4 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-slate-500">Recipient</dt>
                <dd className="font-mono text-slate-200" title={request.recipient}>
                  {shortAddress(request.recipient)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Amount</dt>
                <dd className="text-slate-200">
                  {formatUnits(BigInt(request.amount), TUSD8.decimals)} {TUSD8.symbol}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Reference</dt>
                <dd className="truncate text-slate-200">{request.reference}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Purpose</dt>
                <dd className="truncate text-slate-200">{request.purpose}</dd>
              </div>
            </dl>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runAgent} disabled={!canRun || !agentAccount || !!stage}>
              {stage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
              Agent: pay this request
            </Button>
            {stage && <span className="text-xs text-slate-400">{stage}</span>}
            {!agentAccount && (
              <span className="text-xs text-slate-500">Generate the demo agent above to run this.</span>
            )}
          </div>

          {escalation && (
            <div className="flex flex-col gap-3 rounded-lg border border-caution-500/30 bg-caution-500/10 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-caution-400">
                <AlertTriangle className="h-4 w-4" /> Your approval is needed
                <Badge variant="caution">{escalation.code}</Badge>
              </div>
              <p className="text-sm text-slate-300">{escalation.message}</p>
              <div>
                <Button variant="secondary" size="sm" onClick={approveAsOwner} disabled={!!stage}>
                  <UserCheck className="h-3.5 w-3.5" /> Approve as owner
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                This runs the normal human payment from your wallet. Your own limits do not apply to you, so
                review the details carefully.
              </p>
            </div>
          )}

          {result && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-verified-400">
              <CheckCircle2 className="h-4 w-4" />
              {result.by === "agent" ? "Paid by the agent within your policy." : "Paid with your approval."} The
              on-chain event matched the signed request.
              <a href={explorerTxUrl(result.txHash)} target="_blank" rel="noreferrer" className="underline">
                View transaction
              </a>
            </p>
          )}
          {error && (
            <p className="flex items-start gap-2 text-sm text-danger-400">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Swords className="h-4 w-4 text-danger-400" /> Compromised-agent demo
          </CardTitle>
          <CardDescription>
            Simulates a prompt-injected or hijacked agent. It keeps the recipient&apos;s genuine signature but tries
            to change what was signed. The contract must refuse.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="attack"
                checked={attackKind === "redirect-recipient"}
                onChange={() => setAttackKind("redirect-recipient")}
                className="accent-primary-500"
              />
              Redirect funds to the agent
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="attack"
                checked={attackKind === "alter-amount"}
                onChange={() => setAttackKind("alter-amount")}
                className="accent-primary-500"
              />
              Increase the amount by 1 {TUSD8.symbol}
            </label>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={broadcast}
              onChange={(e) => setBroadcast(e.target.checked)}
              className="h-4 w-4 accent-primary-500"
            />
            Also broadcast it, so the rejected transaction is visible on the explorer (costs a little gas)
          </label>
          <div>
            <Button
              variant="danger"
              onClick={runAttack}
              disabled={!canRun || !agentAccount || attack.state === "running"}
            >
              {attack.state === "running" && <Loader2 className="h-4 w-4 animate-spin" />}
              Run attack
            </Button>
          </div>

          {attack.state === "blocked" && (
            <div className="flex flex-col gap-1 rounded-lg border border-verified-500/30 bg-verified-500/10 p-4 text-sm">
              <p className="font-medium text-verified-400">Blocked by the contract. No funds moved.</p>
              <p className="text-slate-300">{attack.message}</p>
              {attack.txHash && (
                <p className="text-xs text-slate-400">
                  Rejected transaction {attack.reverted ? "(reverted on-chain)" : ""}:{" "}
                  <a href={explorerTxUrl(attack.txHash)} target="_blank" rel="noreferrer" className="underline">
                    view on explorer
                  </a>
                </p>
              )}
              {attack.broadcastError && <p className="text-xs text-slate-500">{attack.broadcastError}</p>}
            </div>
          )}
          {attack.state === "unexpected" && (
            <p className="rounded-lg border border-danger-500/30 bg-danger-500/10 p-4 text-sm text-danger-400">
              Unexpected: the contract simulation would have accepted the tampered request. Nothing was sent. Please
              report this.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
