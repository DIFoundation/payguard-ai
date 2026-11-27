import {
  hashTypedData,
  isAddress,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";
import { QDAY, SETTLEMENT_ADDRESS, TUSD8 } from "@/constants/app";
import type { PaymentRequestData, SignedPaymentRequest } from "@/types";

/**
 * MUST match contracts/src/PayGuardSettlement.sol (EIP712("PayGuard", "1") and REQUEST_TYPEHASH).
 * The Foundry test `test_DigestMatchesFrontendVector` and the vitest "matches the Solidity vector"
 * pin both implementations to the same digest.
 */
export const PAYMENT_REQUEST_DOMAIN_NAME = "PayGuard";
export const PAYMENT_REQUEST_DOMAIN_VERSION = "1";

export const PAYMENT_REQUEST_TYPES = {
  PaymentRequest: [
    { name: "recipient", type: "address" },
    { name: "payer", type: "address" },
    { name: "chainId", type: "uint256" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "reference", type: "string" },
    { name: "purpose", type: "string" },
    { name: "expiresAt", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export class SettlementNotConfiguredError extends Error {
  constructor() {
    super(
      "PayGuardSettlement address is not configured. Set NEXT_PUBLIC_PAYGUARD_SETTLEMENT.",
    );
    this.name = "SettlementNotConfiguredError";
  }
}

/** The configured settlement contract, or throws if missing/invalid. */
export function requireSettlementAddress(): Address {
  if (!SETTLEMENT_ADDRESS || !isAddress(SETTLEMENT_ADDRESS)) {
    throw new SettlementNotConfiguredError();
  }
  return SETTLEMENT_ADDRESS;
}

/** True when `a` is the configured settlement contract (case-insensitive). */
export function isConfiguredSettlement(a: string | undefined | null): boolean {
  return (
    !!a &&
    !!SETTLEMENT_ADDRESS &&
    a.toLowerCase() === SETTLEMENT_ADDRESS.toLowerCase()
  );
}

export function paymentRequestDomain(
  chainId: number = QDAY.chainId,
  verifyingContract: Address = requireSettlementAddress(),
) {
  return {
    name: PAYMENT_REQUEST_DOMAIN_NAME,
    version: PAYMENT_REQUEST_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  } as const;
}

/** Build the EIP-712 typed-data payload for a payment request. */
export function buildPaymentRequestTypedData(
  data: PaymentRequestData,
  verifyingContract: Address = requireSettlementAddress(),
) {
  return {
    domain: paymentRequestDomain(data.chainId, verifyingContract),
    types: PAYMENT_REQUEST_TYPES,
    primaryType: "PaymentRequest" as const,
    message: {
      recipient: data.recipient,
      payer: data.payer,
      chainId: BigInt(data.chainId),
      token: data.token,
      amount: BigInt(data.amount),
      reference: data.reference,
      purpose: data.purpose,
      expiresAt: BigInt(data.expiresAt),
      nonce: data.nonce as Hex,
    },
  };
}

/** Deterministic digest of a payment request (no signature needed). */
export function paymentRequestDigest(
  data: PaymentRequestData,
  verifyingContract: Address = requireSettlementAddress(),
): Hex {
  return hashTypedData(buildPaymentRequestTypedData(data, verifyingContract));
}

/**
 * Recover the signer address for a signed payment request.
 * Returns null when the signature is malformed or unrecoverable.
 */
export async function recoverPaymentRequestSigner(
  data: PaymentRequestData,
  signature: Hex,
  verifyingContract: Address = requireSettlementAddress(),
): Promise<Address | null> {
  try {
    return await recoverTypedDataAddress({
      ...buildPaymentRequestTypedData(data, verifyingContract),
      signature,
    });
  } catch {
    return null;
  }
}

/** Serialize a signed request to a portable JSON string (clipboard / QR safe). */
export function encodeSignedRequest(req: SignedPaymentRequest): string {
  return JSON.stringify({ v: 2, ...req });
}

const UINT = /^\d+$/;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const HEX = /^0x[0-9a-fA-F]+$/;
const UINT256_MAX = (1n << 256n) - 1n;

/**
 * Parse and strictly validate an encoded signed request. Returns null on malformed input,
 * so nothing unparseable ever reaches the contract call or the signature check.
 */
export function decodeSignedRequest(raw: string): SignedPaymentRequest | null {
  try {
    const p = JSON.parse(raw.trim());
    if (!p || typeof p !== "object" || p.v !== 2) return null;

    for (const k of ["recipient", "payer", "token", "verifyingContract", "signer"]) {
      if (typeof p[k] !== "string" || !isAddress(p[k], { strict: false })) return null;
    }
    if (typeof p.chainId !== "number" || !Number.isSafeInteger(p.chainId) || p.chainId <= 0)
      return null;
    for (const k of ["amount", "expiresAt"]) {
      if (typeof p[k] !== "string" || !UINT.test(p[k]) || BigInt(p[k]) > UINT256_MAX) return null;
    }
    if (typeof p.nonce !== "string" || !HEX32.test(p.nonce)) return null;
    if (typeof p.signature !== "string" || !HEX.test(p.signature)) return null;
    if (typeof p.reference !== "string" || typeof p.purpose !== "string") return null;

    return {
      recipient: p.recipient,
      payer: p.payer,
      chainId: p.chainId,
      token: p.token,
      amount: p.amount,
      reference: p.reference,
      purpose: p.purpose,
      expiresAt: p.expiresAt,
      nonce: p.nonce,
      verifyingContract: p.verifyingContract,
      signature: p.signature,
      signer: p.signer,
    };
  } catch {
    return null;
  }
}

/** Generate a fresh unique nonce (bytes32). */
export function generateNonce(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export { TUSD8 };
