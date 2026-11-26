"use client";

import { useState } from "react";
import { ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Textarea, Field } from "@/components/ui/input";
import { usePayGuardWallet } from "@/hooks/usePayGuardWallet";
import { useVerification } from "./useVerification";
import { VerificationPanel } from "./VerificationPanel";
import { RiskReport } from "@/features/risk/RiskReport";

export function VerifyClient() {
  const wallet = usePayGuardWallet();
  const [address, setAddress] = useState("");
  const [requestRaw, setRequestRaw] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const verification = useVerification({
    recipient: address,
    requestRaw,
    token: undefined,
    payer: wallet.address ?? null,
    balanceBaseUnits: wallet.tokenBalance?.value.toString() ?? null,
  });

  const run = () => setSubmitted(true);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Check a recipient</CardTitle>
          <CardDescription>
            Enter a wallet address, paste a signed payment request, or both. Nothing is sent
            anywhere — verification runs against the chain and the signature locally.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Wallet address">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" className="font-mono" />
          </Field>
          <Field label="Signed payment request JSON (optional)">
            <Textarea
              value={requestRaw}
              onChange={(e) => setRequestRaw(e.target.value)}
              placeholder='{"v":1,"recipient":"0x…",…}'
              className="min-h-28 font-mono text-xs"
            />
          </Field>
          <div>
            <Button onClick={run} disabled={!address.trim() && !requestRaw.trim()}>
              <ScanSearch className="h-4 w-4" /> Verify recipient
            </Button>
          </div>
        </CardContent>
      </Card>

      {submitted && (
        <div className="grid gap-6 lg:grid-cols-2">
          <VerificationPanel result={verification} />
          <RiskReport assessment={verification.risk} />
        </div>
      )}
    </div>
  );
}
