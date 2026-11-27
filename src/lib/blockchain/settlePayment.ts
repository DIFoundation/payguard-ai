import { parseEventLogs, type Address, type Hex, type Log } from "viem";
import { paymentRequestDigest } from "@/lib/signatures/paymentRequest";
import {
  SETTLEMENT_ERROR_MESSAGES,
  SETTLEMENT_STATUS,
  STATUS_TO_ERROR,
  settlementAbi,
  toContractRequest,
} from "./settlement";
import type { PaymentRequestData, SignedPaymentRequest } from "@/types";

export type SettleStage =
  | "checking"
  | "approving"
  | "approval-confirming"
  | "settling"
  | "confirming";

export interface ReceiptLike {
  status: "success" | "reverted";
  logs: readonly Log[];
}

/** Everything the flow needs from the chain/wallet, injected so the logic is unit-testable. */
export interface SettleDeps {
  settlement: Address;
  /** `PayGuardSettlement.checkRequest` (free read). */
  checkRequest(
    req: ReturnType<typeof toContractRequest>,
    signature: Hex,
    payer: Address,
  ): Promise<{ status: number; hash: Hex }>;
  allowance(token: Address, owner: Address, spender: Address): Promise<bigint>;
  approve(token: Address, spender: Address, amount: bigint): Promise<Hex>;
  settle(req: ReturnType<typeof toContractRequest>, signature: Hex): Promise<Hex>;
  waitForReceipt(hash: Hex): Promise<ReceiptLike>;
}

export interface SettleResult {
  txHash: Hex;
  approvalTxHash?: Hex;
  /** EIP-712 digest of the request; equals the `requestHash` in the on-chain event. */
  requestHash: Hex;
}

export class SettlementFlowError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SettlementFlowError";
  }
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function requestData(r: SignedPaymentRequest): PaymentRequestData {
  return {
    recipient: r.recipient,
    payer: r.payer,
    chainId: r.chainId,
    token: r.token,
    amount: r.amount,
    reference: r.reference,
    purpose: r.purpose,
    expiresAt: r.expiresAt,
    nonce: r.nonce,
  };
}

/**
 * Confirm a receipt contains the `PaymentSettled` event for exactly this request.
 * Throws unless the event exists, comes from the settlement contract, and matches the
 * expected recipient/payer/token/amount (and agent, when given).
 */
export function verifySettledEvent(
  receipt: ReceiptLike,
  settlement: Address,
  requestHash: Hex,
  expected: { recipient: Address; payer: Address; token: Address; amount: bigint; agent?: Address },
): void {
  const events = parseEventLogs({
    abi: settlementAbi,
    eventName: "PaymentSettled",
    logs: receipt.logs as Log[],
  }).filter((l) => eq(l.address, settlement));
  const ev = events.find((l) => eq(l.args.requestHash, requestHash));
  if (!ev) {
    throw new SettlementFlowError(
      "NoSettlementEvent",
      "The transaction succeeded but no matching PaymentSettled event was found. Do not treat it as paid.",
    );
  }
  const a = ev.args;
  if (
    !eq(a.recipient, expected.recipient) ||
    !eq(a.payer, expected.payer) ||
    !eq(a.token, expected.token) ||
    a.amount !== expected.amount ||
    (expected.agent !== undefined && !eq(a.agent, expected.agent))
  ) {
    throw new SettlementFlowError(
      "EventMismatch",
      "The on-chain payment event does not match the signed request. Do not treat it as paid.",
    );
  }
}

/**
 * Pay a recipient-signed request through PayGuardSettlement.
 *
 *  1. Pre-flight `checkRequest` (free): the contract tells us exactly why it would reject.
 *  2. Confirm the contract's digest equals ours (guards against frontend/contract drift).
 *  3. Approve the EXACT amount, only if the current allowance is lower. Never unlimited.
 *  4. `settle`, wait for the receipt, then verify the `PaymentSettled` event matches the request.
 *
 * A transaction hash alone is never treated as success.
 */
export async function settleSignedRequest(
  deps: SettleDeps,
  req: SignedPaymentRequest,
  payer: Address,
  onStage?: (stage: SettleStage) => void,
): Promise<SettleResult> {
  const data = requestData(req);
  const contractReq = toContractRequest(data);
  const localHash = paymentRequestDigest(data, deps.settlement);

  onStage?.("checking");
  const pre = await deps.checkRequest(contractReq, req.signature, payer);
  const statusName = SETTLEMENT_STATUS[pre.status] ?? "InvalidRequest";
  if (statusName !== "Ok") {
    const key = STATUS_TO_ERROR[statusName];
    throw new SettlementFlowError(
      key,
      SETTLEMENT_ERROR_MESSAGES[key] ?? "The settlement contract rejected this request.",
    );
  }
  if (!eq(pre.hash, localHash)) {
    throw new SettlementFlowError(
      "DigestMismatch",
      "The contract and this app disagree on the request digest. Payment blocked; please report this.",
    );
  }

  const amount = BigInt(req.amount);
  let approvalTxHash: Hex | undefined;
  const allowance = await deps.allowance(req.token, payer, deps.settlement);
  if (allowance < amount) {
    onStage?.("approving");
    approvalTxHash = await deps.approve(req.token, deps.settlement, amount);
    onStage?.("approval-confirming");
    const approval = await deps.waitForReceipt(approvalTxHash);
    if (approval.status !== "success") {
      throw new SettlementFlowError("ApprovalFailed", "The token approval failed on-chain.");
    }
  }

  onStage?.("settling");
  const txHash = await deps.settle(contractReq, req.signature);
  onStage?.("confirming");
  const receipt = await deps.waitForReceipt(txHash);
  if (receipt.status !== "success") {
    throw new SettlementFlowError("SettleReverted", "The payment transaction failed on-chain.");
  }

  verifySettledEvent(receipt, deps.settlement, localHash, {
    recipient: req.recipient,
    payer,
    token: req.token,
    amount,
  });

  return { txHash, approvalTxHash, requestHash: localHash };
}
