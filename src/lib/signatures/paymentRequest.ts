import {
  hashTypedData,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";
import { QDAY, TUSD8 } from "@/constants/app";
import type { PaymentRequestData, SignedPaymentRequest } from "@/types";

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

export function paymentRequestDomain(chainId: number = QDAY.chainId) {
  return {
    name: PAYMENT_REQUEST_DOMAIN_NAME,
    version: PAYMENT_REQUEST_DOMAIN_VERSION,
    chainId,
  } as const;
}

/** Build the EIP-712 typed-data payload for a payment request. */
export function buildPaymentRequestTypedData(data: PaymentRequestData) {
  return {
    domain: paymentRequestDomain(data.chainId),
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
export function paymentRequestDigest(data: PaymentRequestData): Hex {
  return hashTypedData(buildPaymentRequestTypedData(data));
}

/**
 * Recover the signer address for a signed payment request.
 * Returns null when the signature is malformed or unrecoverable.
 */
export async function recoverPaymentRequestSigner(
  data: PaymentRequestData,
  signature: Hex,
): Promise<Address | null> {
  try {
    return await recoverTypedDataAddress({
      ...buildPaymentRequestTypedData(data),
      signature,
    });
  } catch {
    return null;
  }
}

/** Serialize a signed request to a portable JSON string (clipboard / QR safe). */
export function encodeSignedRequest(req: SignedPaymentRequest): string {
  return JSON.stringify({ v: 1, ...req });
}

/** Parse an encoded signed request. Returns null on malformed input. */
export function decodeSignedRequest(raw: string): SignedPaymentRequest | null {
  try {
    const parsed = JSON.parse(raw.trim());
    if (!parsed || typeof parsed !== "object" || parsed.v !== 1) return null;
    const required = [
      "recipient",
      "payer",
      "chainId",
      "token",
      "amount",
      "reference",
      "purpose",
      "expiresAt",
      "nonce",
      "signature",
      "signer",
    ];
    for (const key of required) {
      if (parsed[key] === undefined || parsed[key] === null) return null;
    }
    return parsed as SignedPaymentRequest;
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
