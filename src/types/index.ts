export type RiskSeverity = "info" | "low" | "medium" | "high" | "critical";

export type RiskRecommendation =
  | "PROCEED"
  | "PROCEED_WITH_CAUTION"
  | "REVIEW_REQUIRED"
  | "DO_NOT_PROCEED";

export type EvidenceSource =
  | "user_input"
  | "wallet"
  | "signature"
  | "registry"
  | "token_contract"
  | "balance"
  | "risk_engine"
  | "ai_draft"
  | "local_storage";

export interface RiskFinding {
  code: string;
  title: string;
  severity: RiskSeverity;
  explanation: string;
  evidence: EvidenceSource;
  action: string;
}

export interface RiskAssessment {
  version: string;
  recommendation: RiskRecommendation;
  findings: RiskFinding[];
  evaluatedAt: number;
}

export type VerificationStatus =
  | "VERIFIED_PAYMENT_REQUEST"
  | "REGISTERED_RECIPIENT"
  | "WALLET_CONTROL_VERIFIED"
  | "UNREGISTERED_RECIPIENT"
  | "SIGNATURE_MISMATCH"
  | "PAYMENT_DETAILS_MISMATCH"
  | "EXPIRED_REQUEST"
  | "VERIFICATION_UNAVAILABLE";

export interface PaymentRequestData {
  recipient: `0x${string}`;
  payer: `0x${string}`;
  chainId: number;
  token: `0x${string}`;
  /** Amount in token base units (integer string, e.g. "50000000" for 50 tUSD8). */
  amount: string;
  reference: string;
  purpose: string;
  /** Unix seconds. */
  expiresAt: string;
  /** Unique single-use nonce: 0x-prefixed 32-byte hex (the contract's bytes32). */
  nonce: string;
}

export interface SignedPaymentRequest extends PaymentRequestData {
  /**
   * The PayGuardSettlement contract this request was signed for (EIP-712 `verifyingContract`).
   * A signature is only valid for this contract on this chain.
   */
  verifyingContract: `0x${string}`;
  /** EIP-712 signature (0x-prefixed 65-byte hex). */
  signature: `0x${string}`;
  /** The address that produced the signature. */
  signer: `0x${string}`;
}

export interface PaymentDraft {
  recipient: string;
  amount: string;
  token: string;
  reference: string;
  purpose: string;
  expiresInHours?: number;
}

export interface PaymentRecord {
  id: string;
  kind: "draft" | "confirmed" | "failed";
  recipient: string;
  payer?: string;
  amount: string;
  token: string;
  purpose: string;
  reference: string;
  txHash?: string;
  requestNonce?: string;
  /** EIP-712 digest of the settled request (links the record to the on-chain PaymentSettled event). */
  requestHash?: string;
  /** "settlement" = enforced on-chain by PayGuardSettlement; "direct-transfer" = unprotected plain ERC-20 transfer. */
  settledVia?: "settlement" | "direct-transfer";
  createdAt: number;
  confirmedAt?: number;
}

export interface SavedRecipient {
  address: string;
  label: string;
  addedAt: number;
  lastSeenAt?: number;
}
