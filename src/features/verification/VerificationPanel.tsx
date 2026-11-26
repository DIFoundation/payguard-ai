"use client";

import {
  BadgeCheck,
  CircleDashed,
  FileWarning,
  Landmark,
  Loader2,
  ShieldCheck,
  ShieldX,
  UserCheck,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VerificationResult } from "./useVerification";
import { describeVerificationStatus } from "@/lib/risk-engine/engine";
import { cn } from "@/lib/utils";

const STATUS_META: Record<string, { label: string; variant: "verified" | "info" | "caution" | "danger" | "accent" | "default"; icon: React.ReactNode }> = {
  VERIFIED_PAYMENT_REQUEST: { label: "VERIFIED PAYMENT REQUEST", variant: "verified", icon: <BadgeCheck className="h-4 w-4" /> },
  REGISTERED_RECIPIENT: { label: "REGISTERED RECIPIENT", variant: "info", icon: <Landmark className="h-4 w-4" /> },
  WALLET_CONTROL_VERIFIED: { label: "WALLET CONTROL VERIFIED", variant: "verified", icon: <Wallet className="h-4 w-4" /> },
  UNREGISTERED_RECIPIENT: { label: "UNREGISTERED RECIPIENT", variant: "default", icon: <UserCheck className="h-4 w-4" /> },
  SIGNATURE_MISMATCH: { label: "SIGNATURE MISMATCH", variant: "danger", icon: <ShieldX className="h-4 w-4" /> },
  PAYMENT_DETAILS_MISMATCH: { label: "PAYMENT DETAILS MISMATCH", variant: "danger", icon: <FileWarning className="h-4 w-4" /> },
  EXPIRED_REQUEST: { label: "EXPIRED REQUEST", variant: "caution", icon: <CircleDashed className="h-4 w-4" /> },
  VERIFICATION_UNAVAILABLE: { label: "VERIFICATION UNAVAILABLE", variant: "default", icon: <ShieldCheck className="h-4 w-4" /> },
};

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={cn("text-slate-200", mono && "font-mono text-xs")}>{value}</span>
    </div>
  );
}

export function VerificationPanel({ result }: { result: VerificationResult }) {
  const meta = STATUS_META[result.status] ?? STATUS_META.VERIFICATION_UNAVAILABLE;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recipient Verification</CardTitle>
          {result.loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : (
            <Badge variant={meta.variant} className="gap-1.5">
              {meta.icon}
              {meta.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-slate-400">
          {result.loading ? "Running verification checks…" : describeVerificationStatus(result.status)}
        </p>
        {result.recipient && (
          <div className="rounded-lg border border-slate-800 bg-navy-950/50 p-3">
            <Row label="Recipient" value={result.recipient} mono />
            <Row
              label="PayGuard registered"
              value={
                result.registered === null ? (
                  "Unknown"
                ) : result.registered ? (
                  <span className="text-verified-400">Yes</span>
                ) : (
                  <span className="text-slate-400">No</span>
                )
              }
            />
            <Row
              label="Contract address"
              value={
                result.isContract === null ? (
                  "Unknown"
                ) : result.isContract ? (
                  <span className="text-caution-400">Yes — contract detected</span>
                ) : (
                  <span className="text-slate-400">No — externally owned account</span>
                )
              }
            />
            {result.signer && (
              <Row label="Signature signer" value={result.signer} mono />
            )}
            {result.request && (
              <>
                <Row label="Nonce" value={`${result.request.nonce.slice(0, 18)}…`} mono />
                <Row
                  label="Expires"
                  value={
                    result.expired
                      ? `${new Date(Number(result.request.expiresAt) * 1000).toLocaleString()} (expired)`
                      : new Date(Number(result.request.expiresAt) * 1000).toLocaleString()
                  }
                />
              </>
            )}
          </div>
        )}
        {result.parseError && (
          <p className="rounded-lg border border-danger-500/30 bg-danger-500/10 p-3 text-sm text-danger-400">
            {result.parseError}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
