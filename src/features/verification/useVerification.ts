"use client";

import { useEffect, useMemo, useState } from "react";
import { useReadContract, usePublicClient } from "wagmi";
import { isAddress, type Address } from "viem";
import {
  decodeSignedRequest,
  recoverPaymentRequestSigner,
  isConfiguredSettlement,
} from "@/lib/signatures/paymentRequest";
import { evaluateRisk } from "@/lib/risk-engine/engine";
import { registryAbi } from "@/lib/blockchain/wagmi";
import { REGISTRY_ADDRESS, SETTLEMENT_ADDRESS, QDAY, TUSD8 } from "@/constants/app";
import type {
  RiskAssessment,
  SignedPaymentRequest,
  VerificationStatus,
} from "@/types";

export interface VerificationInput {
  /** Recipient address entered by the user (or request.recipient). */
  recipient?: string;
  /** Raw JSON string of an encoded signed payment request. */
  requestRaw?: string;
  /** Draft amount in base units. */
  amount?: string;
  /** Draft token address. */
  token?: string;
  /** Connected wallet (payer). */
  payer?: string | null;
  /** Payer token balance in base units, for sufficiency checks. */
  balanceBaseUnits?: string | null;
}

export interface VerificationResult {
  status: VerificationStatus;
  statusExplanation: string;
  recipient: Address | null;
  request: SignedPaymentRequest | null;
  parseError: string | null;
  signatureValid: boolean | null;
  signer: Address | null;
  registered: boolean | null;
  isContract: boolean | null;
  expired: boolean | null;
  risk: RiskAssessment;
  loading: boolean;
}

function deriveStatus(input: {
  request: SignedPaymentRequest | null;
  signatureValid: boolean | null;
  signerMatches: boolean | null;
  expired: boolean | null;
  registered: boolean | null;
  parseError: string | null;
  recipient: Address | null;
  loading: boolean;
}): VerificationStatus {
  const { request, signatureValid, signerMatches, expired, registered, parseError, recipient, loading } = input;
  if (loading) return "VERIFICATION_UNAVAILABLE";
  if (parseError) return "VERIFICATION_UNAVAILABLE";
  if (!recipient && !request) return "VERIFICATION_UNAVAILABLE";
  if (request) {
    if (expired) return "EXPIRED_REQUEST";
    if (signatureValid === false || signerMatches === false) return "SIGNATURE_MISMATCH";
    if (signatureValid === true && signerMatches === true) {
      return "VERIFIED_PAYMENT_REQUEST";
    }
    if (signatureValid === null) return "VERIFICATION_UNAVAILABLE";
  }
  if (registered === true) return "REGISTERED_RECIPIENT";
  if (registered === false && recipient) return "UNREGISTERED_RECIPIENT";
  return "VERIFICATION_UNAVAILABLE";
}

export function useVerification(input: VerificationInput): VerificationResult {
  const client = usePublicClient({ chainId: QDAY.chainId });
  const [contractState, setContractState] = useState<{
    addr: string;
    isContract: boolean;
  } | null>(null);
  const [sigState, setSigState] = useState<{
    key: string;
    signer: Address | null;
    valid: boolean | null;
  }>({ key: "", signer: null, valid: null });

  // Parse the request once per raw input.
  const parsed = useMemo(() => {
    if (!input.requestRaw?.trim()) return { request: null, error: null };
    const req = decodeSignedRequest(input.requestRaw);
    if (!req)
      return {
        request: null,
        error:
          "Could not parse the payment request. Expected the JSON produced by PayGuard.",
      };
    return { request: req, error: null };
  }, [input.requestRaw]);

  const request = parsed.request;

  // Effective recipient: explicit input wins; fall back to request.recipient.
  const recipientRaw = input.recipient?.trim() || request?.recipient || "";
  const recipient =
    recipientRaw && isAddress(recipientRaw) ? (recipientRaw as Address) : null;

  const addressForChecks =
    recipient ?? (request?.recipient as Address | undefined) ?? null;

  // Signature recovery (pure computation, no network). State is keyed by the
  // request signature so stale results are never applied to a new request.
  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    const key = request.signature;
    const data = {
      recipient: request.recipient as Address,
      payer: request.payer as Address,
      chainId: request.chainId,
      token: request.token as Address,
      amount: request.amount,
      reference: request.reference,
      purpose: request.purpose,
      expiresAt: request.expiresAt,
      nonce: request.nonce,
    };
    // A request signed for a different settlement contract can never be settled here,
    // so it fails verification even though the signature itself may be well-formed.
    const foreignContract =
      !!SETTLEMENT_ADDRESS && !isConfiguredSettlement(request.verifyingContract);
    recoverPaymentRequestSigner(
      data,
      request.signature as `0x${string}`,
      request.verifyingContract as Address,
    )
      .then((signer) => {
        if (!cancelled)
          setSigState({ key, signer, valid: !!signer && !foreignContract });
      })
      .catch(() => {
        if (!cancelled) setSigState({ key, signer: null, valid: false });
      });
    return () => {
      cancelled = true;
    };
  }, [request]);

  // Contract detection via eth_getCode, keyed by address.
  useEffect(() => {
    if (!client || !addressForChecks) return;
    let cancelled = false;
    client
      .getCode({ address: addressForChecks })
      .then((code) => {
        if (!cancelled)
          setContractState({
            addr: addressForChecks,
            isContract: !!code && code !== "0x",
          });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, addressForChecks]);

  const registeredQuery = useReadContract({
    address: REGISTRY_ADDRESS || undefined,
    abi: registryAbi,
    functionName: "isRegistered",
    args: addressForChecks ? [addressForChecks] : undefined,
    chainId: QDAY.chainId,
    query: { enabled: !!REGISTRY_ADDRESS && !!addressForChecks },
  });

  // Client-only clock: Date.now() during render is disallowed under Cache
  // Components, so `now` starts null and is set after mount, then refreshed.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = setTimeout(tick, 0);
    const i = setInterval(tick, 30_000);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, []);

  const expired =
    request && now !== null ? Number(request.expiresAt) * 1000 <= now : null;

  const sigValid =
    request && sigState.key === request.signature ? sigState.valid : request ? null : null;
  const signer =
    request && sigState.key === request.signature ? sigState.signer : null;

  const signerMatches = request
    ? signer
      ? signer.toLowerCase() === request.recipient.toLowerCase()
      : sigValid === false
        ? false
        : null
    : null;

  const requestChainOk = request ? request.chainId === QDAY.chainId : null;
  const expectedToken = (input.token || TUSD8.address) as Address;
  const requestTokenOk = request
    ? request.token.toLowerCase() === expectedToken.toLowerCase()
    : null;
  const payerMatches =
    request &&
    input.payer &&
    request.payer !== "0x0000000000000000000000000000000000000000"
      ? request.payer.toLowerCase() === input.payer.toLowerCase()
      : null;

  const requestMatchesDraft = useMemo(() => {
    if (!request) return null;
    const checks: boolean[] = [];
    if (input.amount) checks.push(request.amount === input.amount);
    if (input.token)
      checks.push(request.token.toLowerCase() === input.token.toLowerCase());
    if (recipient)
      checks.push(request.recipient.toLowerCase() === recipient.toLowerCase());
    return checks.length ? checks.every(Boolean) : null;
  }, [request, input.amount, input.token, recipient]);

  const isContract =
    contractState && contractState.addr === addressForChecks
      ? contractState.isContract
      : null;

  const registered = REGISTRY_ADDRESS
    ? ((registeredQuery.data as boolean | undefined) ?? null)
    : null;
  const loading = !!request && sigValid === null;

  const risk = useMemo(
    () =>
      evaluateRisk(
        {
          payer: input.payer ?? null,
          recipient: recipientRaw || null,
          amount: input.amount,
          token: input.token || TUSD8.address,
          chainOk: true,
          balanceBaseUnits: input.balanceBaseUnits ?? null,
          recipientIsContract: isContract,
          request: request
            ? {
                recipient: request.recipient as Address,
                payer: request.payer as Address,
                chainId: request.chainId,
                token: request.token as Address,
                amount: request.amount,
                reference: request.reference,
                purpose: request.purpose,
                expiresAt: request.expiresAt,
                nonce: request.nonce,
                verifyingContract: request.verifyingContract as Address,
                signature: request.signature as `0x${string}`,
                signer: (signer ?? request.signer) as Address,
              }
            : null,
          signatureValid: sigValid,
          signerMatchesRecipient: signerMatches,
          requestChainOk,
          requestTokenOk,
          requestExpired: expired,
          payerMatchesRequest: payerMatches,
          recipientRegistered: registered,
          requestMatchesDraft,
        },
        now ?? 0,
      ),
    [
      now,
      recipientRaw,
      input.amount,
      input.token,
      input.payer,
      input.balanceBaseUnits,
      request,
      sigValid,
      signer,
      signerMatches,
      requestChainOk,
      requestTokenOk,
      expired,
      payerMatches,
      registered,
      isContract,
      requestMatchesDraft,
    ],
  );

  const status = deriveStatus({
    request,
    signatureValid: sigValid,
    signerMatches,
    expired,
    registered,
    parseError: parsed.error,
    recipient,
    loading,
  });

  return {
    status,
    statusExplanation: "",
    recipient,
    request,
    parseError: parsed.error,
    signatureValid: sigValid,
    signer,
    registered,
    isContract,
    expired,
    risk,
    loading,
  };
}
