"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { formatUnits, getAbiItem, type Address } from "viem";
import { ExternalLink, RefreshCw, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { settlementAbi } from "@/lib/blockchain/settlementAbi";
import { QDAY, SETTLEMENT_DEPLOY_BLOCK, TUSD8, explorerTxUrl } from "@/constants/app";
import { shortAddress } from "@/lib/utils";

interface Row {
  key: string;
  kind: "Granted" | "Revoked" | "Paid by you" | "Paid by agent";
  block: bigint;
  logIndex: number;
  txHash: string;
  detail: string;
}

const ZERO = "0x0000000000000000000000000000000000000000";
const fmt = (v: bigint) => formatUnits(v, TUSD8.decimals);

/** Reads the owner's policy and payment events straight from the chain (no database). */
export function AuditTrail({
  owner,
  settlement,
  refreshKey,
}: {
  owner: Address;
  settlement: Address;
  refreshKey: number;
}) {
  const publicClient = usePublicClient({ chainId: QDAY.chainId });
  const [manual, setManual] = useState(0);
  const key = `${owner}:${settlement}:${refreshKey}:${manual}`;
  const [state, setState] = useState<{ key: string; rows: Row[]; error?: string } | null>(null);

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    const fromBlock = SETTLEMENT_DEPLOY_BLOCK;
    (async () => {
      try {
        const [granted, revoked, paid] = await Promise.all([
          publicClient.getLogs({
            address: settlement,
            event: getAbiItem({ abi: settlementAbi, name: "PolicySet" }),
            args: { owner },
            fromBlock,
          }),
          publicClient.getLogs({
            address: settlement,
            event: getAbiItem({ abi: settlementAbi, name: "PolicyRevoked" }),
            args: { owner },
            fromBlock,
          }),
          publicClient.getLogs({
            address: settlement,
            event: getAbiItem({ abi: settlementAbi, name: "PaymentSettled" }),
            args: { payer: owner },
            fromBlock,
          }),
        ]);
        const rows: Row[] = [
          ...granted.map((l) => ({
            key: `${l.transactionHash}-${l.logIndex}`,
            kind: "Granted" as const,
            block: l.blockNumber,
            logIndex: l.logIndex,
            txHash: l.transactionHash,
            detail: `${shortAddress(l.args.agent!)} · ≤${fmt(l.args.perTxCap!)} per payment · ≤${fmt(l.args.dailyCap!)} per 24h${l.args.registeredOnly ? " · registered only" : ""}`,
          })),
          ...revoked.map((l) => ({
            key: `${l.transactionHash}-${l.logIndex}`,
            kind: "Revoked" as const,
            block: l.blockNumber,
            logIndex: l.logIndex,
            txHash: l.transactionHash,
            detail: `${shortAddress(l.args.agent!)} can no longer pay for you`,
          })),
          ...paid.map((l) => {
            const byAgent = l.args.agent !== undefined && l.args.agent.toLowerCase() !== ZERO;
            return {
              key: `${l.transactionHash}-${l.logIndex}`,
              kind: (byAgent ? "Paid by agent" : "Paid by you") as Row["kind"],
              block: l.blockNumber,
              logIndex: l.logIndex,
              txHash: l.transactionHash,
              detail: `${fmt(l.args.amount!)} ${TUSD8.symbol} to ${shortAddress(l.args.recipient!)}${byAgent ? ` via ${shortAddress(l.args.agent!)}` : ""}${l.args.paymentRef ? ` · ${l.args.paymentRef}` : ""}`,
            };
          }),
        ].sort((a, b) => (a.block === b.block ? b.logIndex - a.logIndex : a.block > b.block ? -1 : 1));
        if (!cancelled) setState({ key, rows });
      } catch (e) {
        if (!cancelled) {
          setState({
            key,
            rows: [],
            error:
              e instanceof Error
                ? `The RPC could not return event logs: ${e.message.slice(0, 120)}`
                : "The RPC could not return event logs.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, owner, settlement, key]);

  const loading = !state || state.key !== key;
  const variant = (k: Row["kind"]) =>
    k === "Revoked" ? "danger" : k === "Granted" ? "info" : k === "Paid by agent" ? "accent" : "verified";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4 text-primary-400" /> On-chain audit trail
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={() => setManual((m) => m + 1)} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
        <CardDescription>
          Every permission and payment, read directly from PayGuardSettlement events. Nothing here is stored locally.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state?.error && <p className="text-sm text-caution-400">{state.error}</p>}
        {!loading && !state?.error && state?.rows.length === 0 && (
          <p className="text-sm text-slate-500">No on-chain activity yet for this wallet.</p>
        )}
        <ul className="flex flex-col divide-y divide-slate-800">
          {state?.rows.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <Badge variant={variant(r.kind)}>{r.kind}</Badge>
              <span className="min-w-0 flex-1 truncate text-slate-300">{r.detail}</span>
              <span className="text-xs text-slate-500">block {r.block.toString()}</span>
              <a
                href={explorerTxUrl(r.txHash)}
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 hover:text-white"
                aria-label="View transaction"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
