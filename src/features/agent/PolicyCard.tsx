"use client";

import { useEffect, useState } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { formatUnits, isAddress, type Abi, type Address } from "viem";
import { CheckCircle2, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { settlementAbi } from "@/lib/blockchain/settlementAbi";
import { explainSettlementError } from "@/lib/blockchain/settlement";
import { erc20Abi } from "@/lib/blockchain/wagmi";
import { parsePolicyForm, remainingDaily, type PolicyFormField } from "@/lib/agent/policy";
import { QDAY, TUSD8, explorerTxUrl } from "@/constants/app";
import { shortAddress } from "@/lib/utils";
import { useAgentPolicy } from "./useAgentPolicy";

const fmt = (v: bigint) => formatUnits(v, TUSD8.decimals);

interface Props {
  owner: Address;
  settlement: Address;
  agentInput: string;
  onAgentInputChange: (v: string) => void;
  onChanged: () => void;
}

/** Owner grants, inspects and instantly revokes an agent's on-chain permission. */
export function PolicyCard({ owner, settlement, agentInput, onAgentInputChange, onChanged }: Props) {
  const publicClient = usePublicClient({ chainId: QDAY.chainId });
  const { writeContractAsync } = useWriteContract();

  const [perTx, setPerTx] = useState("100");
  const [daily, setDaily] = useState("300");
  const [days, setDays] = useState(7);
  const [registeredOnly, setRegisteredOnly] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<PolicyFormField, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string; tx?: string } | null>(null);

  const agent = isAddress(agentInput.trim()) ? (agentInput.trim() as Address) : undefined;
  const { policy, usage, allowance, refetch } = useAgentPolicy(owner, agent);
  // Render-time clock: lazily initialised, then refreshed on an interval (never read during render).
  const [nowSec, setNowSec] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => {
    const id = setInterval(() => setNowSec(BigInt(Math.floor(Date.now() / 1000))), 15_000);
    return () => clearInterval(id);
  }, []);

  const send = async (
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
  ): Promise<string> => {
    const hash = await writeContractAsync({ address, abi, functionName, args, chainId: QDAY.chainId } as Parameters<
      typeof writeContractAsync
    >[0]);
    const receipt = await publicClient!.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("The transaction failed on-chain.");
    return hash;
  };

  const grant = async () => {
    setMessage(null);
    const clickNow = BigInt(Math.floor(Date.now() / 1000));
    const parsed = parsePolicyForm({ agent: agentInput, owner, perTx, daily, days, registeredOnly }, clickNow, TUSD8.decimals);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    if (!publicClient) return;
    const v = parsed.value;
    try {
      // The allowance is only a CEILING (your daily budget). The policy below is the real control.
      if ((allowance ?? 0n) < v.dailyCap) {
        setBusy("Approve your daily budget as the token allowance (step 1 of 2)…");
        await send(TUSD8.address, erc20Abi as Abi, "approve", [settlement, v.dailyCap]);
      }
      setBusy("Grant the agent its permission (step 2 of 2)…");
      const tx = await send(settlement, settlementAbi as Abi, "setPolicy", [
        v.agent,
        TUSD8.address,
        v.perTxCap,
        v.dailyCap,
        v.expiry,
        v.registeredOnly,
      ]);
      setMessage({ kind: "ok", text: "Permission granted on-chain.", tx });
      refetch();
      onChanged();
    } catch (e) {
      setMessage({ kind: "error", text: explainSettlementError(e) });
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    if (!agent) return;
    setMessage(null);
    setBusy("Revoking…");
    try {
      const tx = await send(settlement, settlementAbi as Abi, "revokeAgent", [agent]);
      setMessage({ kind: "ok", text: "Agent revoked. It can no longer move your funds.", tx });
      refetch();
      onChanged();
    } catch (e) {
      setMessage({ kind: "error", text: explainSettlementError(e) });
    } finally {
      setBusy(null);
    }
  };

  const clearAllowance = async () => {
    setMessage(null);
    setBusy("Clearing token allowance…");
    try {
      const tx = await send(TUSD8.address, erc20Abi as Abi, "approve", [settlement, 0n]);
      setMessage({ kind: "ok", text: "Token allowance cleared.", tx });
      refetch();
    } catch (e) {
      setMessage({ kind: "error", text: explainSettlementError(e) });
    } finally {
      setBusy(null);
    }
  };

  const expired = !!policy?.active && nowSec > policy.expiry;
  const remaining = policy && usage ? remainingDaily(policy, usage, nowSec) : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary-400" /> Agent permission
        </CardTitle>
        <CardDescription>
          Scoped to {TUSD8.symbol}, capped per payment and per 24 hours, expiring, and revocable instantly. The
          agent can only pay requests that the recipient has already signed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field label="Agent wallet" error={errors.agent} hint="The address allowed to call settleAsAgent for you.">
          <Input
            value={agentInput}
            onChange={(e) => onAgentInputChange(e.target.value)}
            placeholder="0x… (or generate a demo agent above)"
            spellCheck={false}
            className="font-mono"
          />
        </Field>

        {agent && policy?.active && (
          <div className="rounded-lg border border-slate-800 bg-navy-950/50 p-4 text-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-medium text-white">Current permission for {shortAddress(agent)}</span>
              {expired ? <Badge variant="danger">Expired</Badge> : <Badge variant="verified">Active</Badge>}
              {policy.registeredOnly && <Badge variant="info">Registered recipients only</Badge>}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-slate-500">Per payment</dt>
                <dd className="text-slate-200">≤ {fmt(policy.perTxCap)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Per 24h</dt>
                <dd className="text-slate-200">≤ {fmt(policy.dailyCap)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Left today</dt>
                <dd className="text-slate-200">{remaining !== undefined ? fmt(remaining) : "…"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Expires</dt>
                <dd className="text-slate-200">{new Date(Number(policy.expiry) * 1000).toLocaleString()}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Token allowance for the settlement contract: {allowance !== undefined ? fmt(allowance) : "…"} {TUSD8.symbol}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="danger" onClick={revoke} disabled={!!busy}>
                <ShieldOff className="h-3.5 w-3.5" /> Revoke agent now
              </Button>
              {(allowance ?? 0n) > 0n && (
                <Button size="sm" variant="ghost" onClick={clearAllowance} disabled={!!busy}>
                  Clear token allowance
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Max per payment (${TUSD8.symbol})`} error={errors.perTx} hint="Above this the agent must ask you.">
            <Input value={perTx} onChange={(e) => setPerTx(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label={`Max per 24 hours (${TUSD8.symbol})`} error={errors.daily} hint="Also the token allowance ceiling.">
            <Input value={daily} onChange={(e) => setDaily(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Permission lasts" error={errors.days} hint="Sessions are capped at 30 days.">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="flex h-10 w-full rounded-lg border border-slate-700 bg-navy-950/60 px-3 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              {[1, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d} day{d > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex cursor-pointer items-center gap-2 pt-6 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={registeredOnly}
              onChange={(e) => setRegisteredOnly(e.target.checked)}
              className="h-4 w-4 accent-primary-500"
            />
            Only pay PayGuard-registered recipients
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={grant} disabled={!!busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {policy?.active ? "Replace permission" : "Grant permission"}
          </Button>
          {busy && <span className="text-xs text-slate-400">{busy}</span>}
        </div>

        {message && (
          <p className={`flex items-center gap-2 text-sm ${message.kind === "ok" ? "text-verified-400" : "text-danger-400"}`}>
            {message.kind === "ok" && <CheckCircle2 className="h-4 w-4" />}
            {message.text}
            {message.tx && (
              <a href={explorerTxUrl(message.tx)} target="_blank" rel="noreferrer" className="underline">
                View transaction
              </a>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
