"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import {
  ArrowRight,
  BadgeCheck,
  Clock,
  FileSearch,
  History,
  PenLine,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePayGuardWallet } from "@/hooks/usePayGuardWallet";
import { usePaymentHistory } from "@/lib/storage/local";
import { TUSD8, QDAY, explorerTxUrl } from "@/constants/app";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-1 font-mono text-lg font-semibold text-slate-100">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function DashboardClient() {
  const wallet = usePayGuardWallet();
  const history = usePaymentHistory();

  const confirmed = history.filter((h) => h.kind === "confirmed");
  const failed = history.filter((h) => h.kind === "failed");
  const recent = history.slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            {wallet.isConnected ? (
              <>
                <span className="font-mono">{wallet.address?.slice(0, 8)}…{wallet.address?.slice(-6)}</span>
                {" · "}
                <span className={wallet.onCorrectChain ? "text-verified-400" : "text-caution-400"}>
                  {wallet.onCorrectChain ? QDAY.name : "Wrong network"}
                </span>
              </>
            ) : (
              "Connect a wallet to view your balances and activity."
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/new-payment"><Button size="sm"><PenLine className="h-4 w-4" /> New payment</Button></Link>
          <Link href="/verify"><Button size="sm" variant="secondary"><FileSearch className="h-4 w-4" /> Verify</Button></Link>
          <Link href="/request"><Button size="sm" variant="secondary"><BadgeCheck className="h-4 w-4" /> Request</Button></Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="tUSD8 balance"
          value={
            wallet.tokenBalance
              ? formatUnits(wallet.tokenBalance.value, TUSD8.decimals)
              : "—"
          }
          sub={wallet.isConnected ? TUSD8.symbol : "connect wallet"}
        />
        <Stat
          label="tQDAY balance"
          value={
            wallet.nativeBalance
              ? formatUnits(wallet.nativeBalance.value, 18).slice(0, 10)
              : "—"
          }
          sub="native gas token"
        />
        <Stat label="Confirmed payments" value={String(confirmed.length)} sub="local history" />
        <Stat label="Failed / attempts" value={String(history.length)} sub={`${failed.length} failed`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-slate-400" /> Recent activity
              </CardTitle>
              <Link href="/history" className="flex items-center gap-1 text-xs text-primary-300 hover:underline">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Clock className="h-8 w-8 text-slate-700" />
                <p className="text-sm text-slate-500">No payments yet.</p>
                <Link href="/new-payment">
                  <Button size="sm" variant="secondary">Make your first verified payment</Button>
                </Link>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-slate-800/70">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-200">
                        {formatUnits(BigInt(r.amount), TUSD8.decimals)} {TUSD8.symbol}
                        {r.purpose ? ` · ${r.purpose}` : ""}
                      </p>
                      <p className="font-mono text-xs text-slate-500">
                        to {r.recipient.slice(0, 8)}…{r.recipient.slice(-6)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          r.kind === "confirmed" ? "verified" : r.kind === "failed" ? "danger" : "default"
                        }
                      >
                        {r.kind}
                      </Badge>
                      {r.txHash && (
                        <a href={explorerTxUrl(r.txHash)} target="_blank" rel="noreferrer" className="text-xs text-primary-300 hover:underline">
                          tx
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-verified-400" /> How PayGuard protects you
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-slate-400">
            <p>· Signed payment requests bind recipient, amount, token, chain, expiry, and nonce.</p>
            <p>· Any tampered field fails EIP-712 signature verification instantly.</p>
            <p>· A deterministic risk engine explains every finding before you pay.</p>
            <p>· You always sign the final transfer yourself — PayGuard never touches funds.</p>
            <Link href="/how-it-works">
              <Button variant="ghost" size="sm" className="mt-1 px-0">
                Learn more <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
