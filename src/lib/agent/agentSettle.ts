import type { Address, Hex } from "viem";
import { paymentRequestDigest } from "@/lib/signatures/paymentRequest";
import {
  SETTLEMENT_ERROR_MESSAGES,
  SETTLEMENT_STATUS,
  STATUS_TO_ERROR,
  toContractRequest,
} from "@/lib/blockchain/settlement";
import {
  SettlementFlowError,
  requestData,
  verifySettledEvent,
  type ReceiptLike,
  type SettleResult,
} from "@/lib/blockchain/settlePayment";
import { previewAgentPayment, type AgentPolicy, type AgentUsage } from "./policy";
import type { SignedPaymentRequest } from "@/types";

export type AgentStage = "checking" | "sending" | "confirming";

/** Everything the agent flow needs; the AGENT's key signs `settleAsAgent`, never the owner's wallet. */
export interface AgentDeps {
  settlement: Address;
  agent: Address;
  readPolicy(owner: Address, agent: Address): Promise<{ policy: AgentPolicy; usage: AgentUsage }>;
  isRegistered(wallet: Address): Promise<boolean>;
  checkRequest(
    req: ReturnType<typeof toContractRequest>,
    signature: Hex,
    payer: Address,
  ): Promise<{ status: number; hash: Hex }>;
  allowance(token: Address, owner: Address, spender: Address): Promise<bigint>;
  settleAsAgent(
    owner: Address,
    req: ReturnType<typeof toContractRequest>,
    signature: Hex,
  ): Promise<Hex>;
  waitForReceipt(hash: Hex): Promise<ReceiptLike>;
  nowSec(): bigint;
}

/** The agent was stopped before sending a transaction. `needsHuman` = the owner can approve instead. */
export class AgentBlockedError extends SettlementFlowError {
  constructor(
    code: string,
    message: string,
    public readonly needsHuman: boolean,
  ) {
    super(code, message);
    this.name = "AgentBlockedError";
  }
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * An AI agent pays a recipient-signed request on behalf of `owner`, inside the owner's on-chain policy.
 *
 *  1. Mirror the contract's policy checks (explains a block before any gas is spent).
 *  2. Contract pre-flight (`checkRequest` with the OWNER as payer) + digest equality.
 *  3. The owner's allowance must already cover it (an agent can never approve anyone's tokens).
 *  4. Send `settleAsAgent`, wait for the receipt, verify the event (including the agent address).
 */
export async function settleAsAgentFlow(
  deps: AgentDeps,
  owner: Address,
  req: SignedPaymentRequest,
  onStage?: (s: AgentStage) => void,
): Promise<SettleResult> {
  const data = requestData(req);
  const contractReq = toContractRequest(data);
  const localHash = paymentRequestDigest(data, deps.settlement);
  const amount = BigInt(req.amount);

  onStage?.("checking");
  const { policy, usage } = await deps.readPolicy(owner, deps.agent);
  const registered = policy.registeredOnly ? await deps.isRegistered(req.recipient) : true;
  const preview = previewAgentPayment({
    policy,
    usage,
    amount,
    token: req.token,
    recipientRegistered: registered,
    nowSec: deps.nowSec(),
  });
  if (!preview.ok) throw new AgentBlockedError(preview.reason, preview.message, preview.needsHuman);

  const pre = await deps.checkRequest(contractReq, req.signature, owner);
  const statusName = SETTLEMENT_STATUS[pre.status] ?? "InvalidRequest";
  if (statusName !== "Ok") {
    const key = STATUS_TO_ERROR[statusName];
    throw new AgentBlockedError(
      key,
      SETTLEMENT_ERROR_MESSAGES[key] ?? "The settlement contract rejected this request.",
      false,
    );
  }
  if (!eq(pre.hash, localHash)) {
    throw new AgentBlockedError(
      "DigestMismatch",
      "The contract and this app disagree on the request digest. Payment blocked.",
      false,
    );
  }

  const allowance = await deps.allowance(req.token, owner, deps.settlement);
  if (allowance < amount) {
    throw new AgentBlockedError(
      "ERC20InsufficientAllowance",
      "The owner's token allowance is too low. An agent cannot approve funds, so the owner must raise it.",
      true,
    );
  }

  onStage?.("sending");
  const txHash = await deps.settleAsAgent(owner, contractReq, req.signature);
  onStage?.("confirming");
  const receipt = await deps.waitForReceipt(txHash);
  if (receipt.status !== "success") {
    throw new SettlementFlowError("SettleReverted", "The agent payment failed on-chain.");
  }
  verifySettledEvent(receipt, deps.settlement, localHash, {
    recipient: req.recipient,
    payer: owner,
    token: req.token,
    amount,
    agent: deps.agent,
  });
  return { txHash, requestHash: localHash };
}
