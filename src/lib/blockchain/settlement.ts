import { BaseError, ContractFunctionRevertedError, type Address, type Hex } from "viem";
import type { PaymentRequestData } from "@/types";

export { settlementAbi } from "./settlementAbi";

/**
 * The Solidity struct calls the `reference` member `paymentRef` (`reference` is a reserved word
 * in Solidity). The signed EIP-712 type string still says `reference`, so only this call-argument
 * shape differs from the typed-data message.
 */
export function toContractRequest(data: PaymentRequestData) {
  return {
    recipient: data.recipient as Address,
    payer: data.payer as Address,
    chainId: BigInt(data.chainId),
    token: data.token as Address,
    amount: BigInt(data.amount),
    paymentRef: data.reference,
    purpose: data.purpose,
    expiresAt: BigInt(data.expiresAt),
    nonce: data.nonce as Hex,
  };
}

/** Mirrors `PayGuardSettlement.Status` (checkRequest pre-flight). */
export const SETTLEMENT_STATUS = [
  "Ok",
  "Expired",
  "WrongChain",
  "WrongPayer",
  "InvalidRequest",
  "NonceUsed",
  "InvalidSignature",
] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUS)[number];

/** Plain-language explanations for every custom error the settlement contract can revert with. */
export const SETTLEMENT_ERROR_MESSAGES: Record<string, string> = {
  RequestExpired: "This payment request has expired. Ask the recipient for a new one.",
  WrongChain: "This request was signed for a different network. Do not pay it.",
  WrongPayer: "This request was issued to a different payer wallet.",
  InvalidRequest:
    "The request is invalid (zero amount, zero address, or paying yourself).",
  NonceAlreadyUsed:
    "This request was already paid or was cancelled by the recipient.",
  InvalidSignature:
    "The signature does not match these payment details. The request was altered or was not signed by the recipient. Do not pay it.",
  TransferAmountMismatch:
    "The token took a fee on transfer, so the recipient would receive less than requested. Payment blocked.",
  NoActivePolicy: "This agent has no active permission from the payer wallet.",
  PolicyExpired: "The agent's permission has expired. Renew or revoke it.",
  TokenNotAllowed: "The agent is not allowed to pay with this token.",
  ExceedsPerTxCap:
    "This amount is above the agent's per-payment limit. A human must approve it.",
  ExceedsDailyCap: "The agent has reached its 24-hour spending limit.",
  RecipientNotRegistered:
    "The agent may only pay PayGuard-registered recipients, and this one is not registered.",
  InvalidPolicy:
    "Invalid agent permission (check limits, token, and an expiry within 30 days).",
  ReentrancyGuardReentrantCall: "Blocked a re-entrant call.",
  ERC20InsufficientAllowance:
    "Token allowance is too low. Approve at least the payment amount first.",
  ERC20InsufficientBalance: "Insufficient token balance for this payment.",
};

/** Turn a viem/wagmi error from a settlement call into a plain-language message. */
export function explainSettlementError(err: unknown): string {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && SETTLEMENT_ERROR_MESSAGES[name]) return SETTLEMENT_ERROR_MESSAGES[name];
    }
    if (/user rejected|denied transaction/i.test(err.message)) {
      return "You rejected the request in your wallet.";
    }
    return err.shortMessage || err.message;
  }
  return err instanceof Error ? err.message : "Unknown error.";
}
