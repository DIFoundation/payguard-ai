"use client";

import { useEffect, useMemo, useState } from "react";
import { useSignTypedData } from "wagmi";
import { parseUnits, type Address, isAddress } from "viem";
import { Check, Copy, Download, Loader2, PenLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { usePayGuardWallet } from "@/hooks/usePayGuardWallet";
import {
  buildPaymentRequestTypedData,
  requireSettlementAddress,
  encodeSignedRequest,
  generateNonce,
} from "@/lib/signatures/paymentRequest";
import { TUSD8, QDAY } from "@/constants/app";
import type { PaymentRequestData, SignedPaymentRequest } from "@/types";

export function RequestCreator() {
  const wallet = usePayGuardWallet();
  const { signTypedDataAsync, isPending } = useSignTypedData();

  const [recipient, setRecipient] = useState("");
  const [payer, setPayer] = useState(""); // optional; zero address = any payer
  const [amountDisplay, setAmountDisplay] = useState("");
  const [purpose, setPurpose] = useState("");
  const [reference, setReference] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("72");
  // Nonce is generated client-side after mount (crypto is unavailable during prerender).
  const [nonce, setNonce] = useState<`0x${string}` | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setNonce(generateNonce()), 0);
    return () => clearTimeout(t);
  }, []);
  const [signed, setSigned] = useState<SignedPaymentRequest | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountBase = useMemo(() => {
    if (!/^\d+(\.\d{1,6})?$/.test(amountDisplay.trim())) return null;
    try {
      const units = parseUnits(amountDisplay.trim(), TUSD8.decimals);
      return units > 0n ? units.toString() : null;
    } catch {
      return null;
    }
  }, [amountDisplay]);

  const recipientValid = isAddress(recipient);
  const payerValid = payer.trim() === "" || isAddress(payer);
  const canSign =
    wallet.isConnected &&
    wallet.onCorrectChain &&
    recipientValid &&
    payerValid &&
    !!amountBase &&
    !!purpose.trim() &&
    !!nonce;

  const create = async () => {
    if (!nonce) return;
    setError(null);
    const expiresAt =
      Math.floor(Date.now() / 1000) +
      Math.max(1, parseInt(expiresInHours || "0", 10) || 0) * 3600;
    const data: PaymentRequestData = {
      recipient: recipient as Address,
      payer: (payer.trim() || "0x0000000000000000000000000000000000000000") as Address,
      chainId: QDAY.chainId,
      token: TUSD8.address,
      amount: amountBase!,
      reference: reference.trim(),
      purpose: purpose.trim(),
      expiresAt: expiresAt.toString(),
      nonce,
    };
    try {
      const verifyingContract = requireSettlementAddress();
      const typed = buildPaymentRequestTypedData(data, verifyingContract);
      const signature = await signTypedDataAsync({
        ...typed,
        account: wallet.address,
      });
      setSigned({ ...data, verifyingContract, signature, signer: wallet.address! });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signing was rejected or failed.");
    }
  };

  const encoded = signed ? encodeSignedRequest(signed) : null;

  const copy = async () => {
    if (!encoded) return;
    await navigator.clipboard.writeText(encoded);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    if (!encoded) return;
    const blob = new Blob([encoded], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payguard-request-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Create a payment request</CardTitle>
          <CardDescription>
            You sign the request with your wallet. The payer can verify every protected field
            before paying you.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!wallet.isConnected && (
            <p className="rounded-lg border border-caution-500/30 bg-caution-500/10 p-3 text-sm text-caution-400">
              Connect your wallet to sign the request.
            </p>
          )}
          {wallet.isConnected && !wallet.onCorrectChain && (
            <p className="rounded-lg border border-caution-500/30 bg-caution-500/10 p-3 text-sm text-caution-400">
              Switch to {QDAY.name} to create a valid request.
            </p>
          )}

          <Field label="Your wallet (recipient)" hint="Defaults shown below — this is who gets paid.">
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={wallet.address ?? "0x…"}
              className="font-mono"
            />
          </Field>

          <Field label="Intended payer (optional)" hint="Leave empty to allow any payer.">
            <Input value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="0x… (optional)" className="font-mono" />
          </Field>

          <Field label={`Amount (${TUSD8.symbol})`}>
            <Input value={amountDisplay} onChange={(e) => setAmountDisplay(e.target.value)} placeholder="50.00" inputMode="decimal" />
          </Field>

          <Field label="Purpose">
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Design invoice #1042" />
          </Field>

          <Field label="Reference (optional)">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="INV-1042" />
          </Field>

          <Field label="Expires in (hours)">
            <Input value={expiresInHours} onChange={(e) => setExpiresInHours(e.target.value)} inputMode="numeric" />
          </Field>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5" />
            Signed fields: recipient, payer, chain, token, amount, reference, purpose, expiry, nonce.
            Changing any of them invalidates the signature.
          </div>

          {error && <p className="text-sm text-danger-400">{error}</p>}

          <Button onClick={create} disabled={!canSign || isPending} size="lg">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
            {isPending ? "Sign in wallet…" : "Sign payment request"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Signed request</CardTitle>
          <CardDescription>
            Share this JSON with your payer. It is self-contained and verifiable offline.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {signed && encoded ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="verified">Signature attached</Badge>
                <Badge variant="info">Chain {QDAY.chainId}</Badge>
                <Badge variant="default">Nonce {nonce?.slice(0, 10)}…</Badge>
              </div>
              <pre className="max-h-64 overflow-auto rounded-lg border border-slate-800 bg-navy-950/70 p-3 text-xs text-slate-300">
                {encoded}
              </pre>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={copy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy JSON"}
                </Button>
                <Button variant="outline" onClick={download}>
                  <Download className="h-4 w-4" /> Download
                </Button>
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">
              Sign a request to generate the portable JSON payload.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
