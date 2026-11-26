"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import { ExternalLink, History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TUSD8, explorerTxUrl } from "@/constants/app";
import { usePaymentHistory } from "@/lib/storage/local";

export default function HistoryPage() {
  const history = usePaymentHistory();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Transaction history</h1>
        <p className="mt-1 text-sm text-slate-400">
          Local records of payment attempts. Confirmed entries match on-chain transactions; drafts are
          not on-chain evidence.
        </p>
      </div>

      {history.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <History className="h-9 w-9 text-slate-700" />
            <p className="text-sm text-slate-500">No payment records yet.</p>
            <Link href="/new-payment"><Button size="sm">New payment</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {history.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-slate-100">
                      {formatUnits(BigInt(r.amount), TUSD8.decimals)} {TUSD8.symbol}
                    </span>
                    <Badge
                      variant={
                        r.kind === "confirmed" ? "verified" : r.kind === "failed" ? "danger" : "default"
                      }
                    >
                      {r.kind === "draft" ? "draft" : r.kind}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {r.purpose || "No purpose"} {r.reference ? `· ref ${r.reference}` : ""}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">
                    to {r.recipient}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    {new Date(r.createdAt).toLocaleString()}
                  </p>
                </div>
                {r.txHash && (
                  <a
                    href={explorerTxUrl(r.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-primary-300 hover:underline"
                  >
                    {r.txHash.slice(0, 14)}… <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
