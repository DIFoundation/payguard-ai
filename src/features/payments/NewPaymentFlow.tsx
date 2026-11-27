"use client";

import { useMemo, useState } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { formatUnits, isAddress, parseEventLogs, parseUnits, type Address, type Hex } from "viem";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Textarea, Field } from "@/components/ui/input";
import { usePayGuardWallet } from "@/hooks/usePayGuardWallet";
import { useVerification } from "@/features/verification/useVerification";
import { VerificationPanel } from "@/features/verification/VerificationPanel";
import { RiskReport } from "@/features/risk/RiskReport";
import { erc20Abi, TUSD8 } from "@/lib/blockchain/wagmi";
import { explainSettlementError } from "@/lib/blockchain/settlement";
import { settleSignedRequest, type SettleStage } from "@/lib/blockchain/settlePayment";
import { buildSettleDeps, type WriteContractFn } from "@/lib/blockchain/settleDeps";
import { QDAY, SETTLEMENT_ADDRESS, explorerTxUrl } from "@/constants/app";
import { addPaymentRecord, updatePaymentRecord } from "@/lib/storage/local";

type Stage = "compose" | "review" | "submitting" | "confirming" | "done" | "failed";

function newId() {
  return `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function NewPaymentFlow() {
  const wallet = usePayGuardWallet();
  const publicClient = usePublicClient({ chainId: QDAY.chainId });
  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [progress, setProgress] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifiedOnChain, setVerifiedOnChain] = useState(false);

  const [stage, setStage] = useState<Stage>("compose");
  const [recipient, setRecipient] = useState("");
  const [amountDisplay, setAmountDisplay] = useState("");
  const [purpose, setPurpose] = useState("");
  const [reference, setReference] = useState("");
  const [requestRaw, setRequestRaw] = useState("");
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const amountBase = useMemo(() => {
    if (!/^\d+(\.\d{1,6})?$/.test(amountDisplay.trim())) return null;
    try {
      const units = parseUnits(amountDisplay.trim(), TUSD8.decimals);
      return units > 0n ? units.toString() : null;
    } catch {
      return null;
    }
  }, [amountDisplay]);

  const verification = useVerification({
    recipient,
    requestRaw,
    amount: amountBase ?? undefined,
    token: TUSD8.address,
    payer: wallet.address ?? null,
    balanceBaseUnits: wallet.tokenBalance?.value.toString() ?? null,
  });

  // A pasted request must be fully verified before paying. Clear it to pay without protection.
  const requestPasted = requestRaw.trim().length > 0;
  const requestVerified =
    verification.status === "VERIFIED_PAYMENT_REQUEST" && !!verification.request;
  const settlementReady = !!SETTLEMENT_ADDRESS && isAddress(SETTLEMENT_ADDRESS);
  /** Protected = the settlement contract re-verifies the recipient's signature on-chain. */
  const protectedPath = requestVerified && settlementReady;

  const canReview =
    !!verification.recipient &&
    !!amountBase &&
    wallet.isConnected &&
    verification.risk.recommendation !== "DO_NOT_PROCEED" &&
    (!requestPasted || protectedPath);

  const balanceSufficient =
    wallet.tokenBalance && amountBase
      ? BigInt(wallet.tokenBalance.value.toString()) >= BigInt(amountBase)
      : null;

  const goReview = () => {
    if (!canReview) return;
    const id = newId();
    setPaymentId(id);
    addPaymentRecord({
      id,
      kind: "draft",
      recipient: verification.recipient!,
      payer: wallet.address,
      amount: amountBase!,
      token: TUSD8.address,
      purpose,
      reference,
      requestNonce: verification.request?.nonce,
      createdAt: Date.now(),
    });
    setStage("review");
  };

  const stageText = (st: SettleStage): string => {
    switch (st) {
      case "checking":
        return "Checking the request with the settlement contract…";
      case "approving":
        return `Approve exactly ${amountBase ? formatUnits(BigInt(amountBase), TUSD8.decimals) : ""} ${TUSD8.symbol} in your wallet (step 1 of 2)…`;
      case "approval-confirming":
        return "Confirming approval on QDay Aevum…";
      case "settling":
        return "Authorize the payment in your wallet (step 2 of 2)…";
      case "confirming":
        return "Confirming payment on QDay Aevum…";
    }
  };

  const pay = async () => {
    if (!publicClient || !wallet.address || !verification.recipient || !amountBase) return;
    const payer = wallet.address as Address;
    setErrorMsg(null);
    setTxHash(null);
    setVerifiedOnChain(false);
    setStage("submitting");
    setProgress("Preparing…");
    try {
      if (protectedPath && verification.request) {
        // Contract-enforced path: PayGuardSettlement re-verifies the recipient's signature.
        const settlement = SETTLEMENT_ADDRESS as Address;
        const write: WriteContractFn = (a) =>
          writeContractAsync({ ...a, chainId: QDAY.chainId } as Parameters<typeof writeContractAsync>[0]);
        const deps = buildSettleDeps(publicClient, write, settlement);
        const result = await settleSignedRequest(deps, verification.request, payer, (st) => {
          setProgress(stageText(st));
          setStage(st === "approval-confirming" || st === "confirming" ? "confirming" : "submitting");
        });
        setTxHash(result.txHash);
        setVerifiedOnChain(true);
        if (paymentId) {
          updatePaymentRecord(paymentId, {
            kind: "confirmed",
            txHash: result.txHash,
            requestHash: result.requestHash,
            settledVia: "settlement",
            confirmedAt: Date.now(),
          });
        }
        setStage("done");
      } else {
        // Unprotected fallback: plain ERC-20 transfer (no recipient signature to enforce).
        setProgress("Authorize the transfer in your wallet…");
        const hash = await writeContractAsync({
          address: TUSD8.address,
          abi: erc20Abi,
          functionName: "transfer",
          args: [verification.recipient, BigInt(amountBase)],
          chainId: QDAY.chainId,
        });
        setTxHash(hash);
        if (paymentId) updatePaymentRecord(paymentId, { txHash: hash, settledVia: "direct-transfer" });
        setStage("confirming");
        setProgress("Confirming transaction on QDay Aevum…");
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("The transfer failed on-chain.");
        const matched = parseEventLogs({
          abi: erc20Abi,
          eventName: "Transfer",
          logs: receipt.logs,
        }).some(
          (l) =>
            l.address.toLowerCase() === TUSD8.address.toLowerCase() &&
            l.args.from.toLowerCase() === payer.toLowerCase() &&
            l.args.to.toLowerCase() === verification.recipient!.toLowerCase() &&
            l.args.value === BigInt(amountBase),
        );
        if (!matched) {
          throw new Error("No matching Transfer event in the receipt. Do not treat this as paid.");
        }
        setVerifiedOnChain(true);
        if (paymentId) updatePaymentRecord(paymentId, { kind: "confirmed", confirmedAt: Date.now() });
        setStage("done");
      }
    } catch (e) {
      setErrorMsg(
        e instanceof Error && e.name === "SettlementFlowError" ? e.message : explainSettlementError(e),
      );
      if (paymentId) updatePaymentRecord(paymentId, { kind: "failed", confirmedAt: Date.now() });
      setStage("failed");
    }
  };

  const reset = () => {
    setTxHash(null);
    setErrorMsg(null);
    setProgress("");
    setVerifiedOnChain(false);
    setStage("compose");
    setRecipient("");
    setAmountDisplay("");
    setPurpose("");
    setReference("");
    setRequestRaw("");
    setPaymentId(null);
  };

  if (!wallet.isConnected) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <Wallet className="h-10 w-10 text-slate-600" />
          <div>
            <p className="font-medium text-slate-200">Connect your wallet to make a payment</p>
            <p className="mt-1 text-sm text-slate-500">
              Payments are signed and broadcast directly from your wallet. PayGuard never holds keys or funds.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!wallet.onCorrectChain) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <ShieldAlert className="h-10 w-10 text-caution-400" />
          <div>
            <p className="font-medium text-slate-200">Wrong network</p>
            <p className="mt-1 text-sm text-slate-500">
              Switch to {QDAY.name} (chain ID {QDAY.chainId}) to continue.
            </p>
          </div>
          <Button onClick={wallet.switchChain} disabled={wallet.isSwitching}>
            {wallet.isSwitching ? "Switching…" : "Switch network"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="flex flex-col gap-6 lg:col-span-3">
        <AnimatePresence mode="wait">
          {stage === "compose" && (
            <motion.div key="compose" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <Card>
                <CardHeader>
                  <CardTitle>Payment details</CardTitle>
                  <CardDescription>
                    Enter the payment manually or import a signed PayGuard payment request.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Field label="Recipient address" hint="The wallet that will receive tUSD8.">
                    <Input
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="0x…"
                      className="font-mono"
                    />
                  </Field>

                  <Field label="Amount (tUSD8)" hint="Decimal amount, e.g. 50 for 50 tUSD8.">
                    <Input
                      value={amountDisplay}
                      onChange={(e) => setAmountDisplay(e.target.value)}
                      placeholder="0.00"
                      inputMode="decimal"
                    />
                    {amountBase && (
                      <p className="text-xs text-slate-500">
                        = {amountBase} base units ({formatUnits(BigInt(amountBase), TUSD8.decimals)} {TUSD8.symbol})
                      </p>
                    )}
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Purpose" hint="What is this payment for?">
                      <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Design invoice #1042" />
                    </Field>
                    <Field label="Reference" hint="Optional invoice / order reference.">
                      <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="INV-1042" />
                    </Field>
                  </div>

                  <Field
                    label="Signed payment request (optional but recommended)"
                    hint="Paste the JSON produced by 'Create payment request'. Any change to protected fields fails verification."
                  >
                    <Textarea
                      value={requestRaw}
                      onChange={(e) => setRequestRaw(e.target.value)}
                      placeholder='{"v":2,"recipient":"0x…",…}'
                      className="min-h-28 font-mono text-xs"
                    />
                  </Field>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={goReview} disabled={!canReview} size="lg">
                      Review payment <ArrowRight className="h-4 w-4" />
                    </Button>
                    {!canReview && (
                      <p className="text-xs text-slate-500">
                        {!verification.recipient
                          ? "Enter a valid recipient address."
                          : !amountBase
                            ? "Enter a valid amount."
                            : verification.risk.recommendation === "DO_NOT_PROCEED"
                              ? "Risk engine recommends not proceeding — see findings."
                              : requestPasted && requestVerified && !settlementReady
                                ? "The PayGuardSettlement address is not configured (NEXT_PUBLIC_PAYGUARD_SETTLEMENT)."
                                : requestPasted && !requestVerified
                                  ? "The pasted request is not verified. Fix it, or clear the box to pay without protection."
                                  : "Complete the required fields."}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {(stage === "review" || stage === "submitting" || stage === "confirming" || stage === "done" || stage === "failed") && (
            <motion.div key="review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardHeader>
                  <CardTitle>Review payment</CardTitle>
                  <CardDescription>Confirm every detail before authorizing in your wallet.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-1 text-sm">
                  {protectedPath ? (
                    <p className="mb-2 flex items-start gap-2 rounded-lg border border-verified-500/30 bg-verified-500/10 p-3 text-xs text-verified-400">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                      Protected: the PayGuardSettlement contract re-verifies the recipient&apos;s signature
                      on-chain and rejects this payment if any signed detail was altered.
                    </p>
                  ) : (
                    <p className="mb-2 flex items-start gap-2 rounded-lg border border-caution-500/30 bg-caution-500/10 p-3 text-xs text-caution-400">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      Unprotected: no signed payment request was provided, so this is a plain token transfer
                      that no contract can check against the recipient&apos;s intent.
                    </p>
                  )}
                  <ReviewRow label="From" value={wallet.address ?? ""} mono />
                  <ReviewRow label="To" value={verification.recipient ?? ""} mono />
                  <ReviewRow
                    label="Amount"
                    value={amountBase ? `${formatUnits(BigInt(amountBase), TUSD8.decimals)} ${TUSD8.symbol}` : "—"}
                  />
                  <ReviewRow label="Token" value={`${TUSD8.symbol} · ${TUSD8.address.slice(0, 10)}…`} mono />
                  <ReviewRow label="Network" value={QDAY.name} />
                  <ReviewRow label="Purpose" value={purpose || "—"} />
                  <ReviewRow label="Reference" value={reference || "—"} />
                  {verification.request && (
                    <ReviewRow label="Request nonce" value={`${verification.request.nonce.slice(0, 14)}…`} mono />
                  )}
                  {balanceSufficient === false && (
                    <p className="mt-2 rounded-lg border border-danger-500/30 bg-danger-500/10 p-3 text-sm text-danger-400">
                      Insufficient {TUSD8.symbol} balance. You hold{" "}
                      {wallet.tokenBalance ? formatUnits(wallet.tokenBalance.value, TUSD8.decimals) : "0"}{" "}
                      {TUSD8.symbol}.
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-6 lg:col-span-2">
        <VerificationPanel result={verification} />
        <RiskReport assessment={verification.risk} />

        {(stage === "review" || stage === "submitting" || stage === "confirming" || stage === "done" || stage === "failed") && (
          <Card>
            <CardContent className="flex flex-col gap-3 p-5">
              {stage === "review" && (
                <>
                  <Button onClick={pay} disabled={balanceSufficient === false} size="lg" className="w-full">
                    <Wallet className="h-4 w-4" /> Authorize payment in wallet
                  </Button>
                  <Button variant="ghost" onClick={() => setStage("compose")} className="w-full">
                    Back to edit
                  </Button>
                </>
              )}
              {(stage === "submitting" || stage === "confirming") && (
                <div className="flex items-center gap-3 text-sm text-slate-300">
                  <Loader2 className="h-4 w-4 animate-spin text-primary-400" />
                  {progress || (stage === "submitting" ? "Waiting for wallet signature…" : "Confirming transaction on QDay Aevum…")}
                </div>
              )}
              {stage === "done" && txHash && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-verified-400">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">Payment confirmed</span>
                  </div>
                  {verifiedOnChain && (
                    <p className="text-xs text-slate-400">
                      {protectedPath
                        ? "Verified on-chain: the PaymentSettled event matches the signed request."
                        : "Verified on-chain: the Transfer event matches the payment."}
                    </p>
                  )}
                  <a
                    href={explorerTxUrl(txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 font-mono text-xs text-primary-300 hover:underline"
                  >
                    {txHash.slice(0, 18)}… <ExternalLink className="h-3 w-3" />
                  </a>
                  <Button variant="secondary" onClick={reset}>Make another payment</Button>
                </div>
              )}
              {stage === "failed" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-danger-400">
                    <ShieldAlert className="h-5 w-5" />
                    <span className="font-medium">Payment not completed</span>
                  </div>
                  {errorMsg && <p className="text-sm text-slate-300">{errorMsg}</p>}
                  <Button variant="secondary" onClick={() => { setErrorMsg(null); setProgress(""); setStage("review"); }}>
                    Try again
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-800/60 py-2 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className={mono ? "font-mono text-xs text-slate-200" : "text-right text-slate-200"}>{value}</span>
    </div>
  );
}
