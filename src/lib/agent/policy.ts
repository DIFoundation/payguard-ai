import { isAddress, parseUnits, type Address } from "viem";
import { SETTLEMENT_ERROR_MESSAGES } from "@/lib/blockchain/settlement";

/** Mirrors PayGuardSettlement.WINDOW / MAX_SESSION. */
export const WINDOW_SECONDS = 86_400n;
export const MAX_SESSION_SECONDS = 30n * 86_400n;
/** Safety margin so a slightly-fast local clock never produces an expiry the contract rejects. */
const EXPIRY_BUFFER_SECONDS = 600n;

export interface AgentPolicy {
  token: Address;
  perTxCap: bigint;
  dailyCap: bigint;
  /** unix seconds */
  expiry: bigint;
  registeredOnly: boolean;
  active: boolean;
}

export interface AgentUsage {
  windowStart: bigint;
  spent: bigint;
}

export type AgentBlockReason =
  | "NoActivePolicy"
  | "PolicyExpired"
  | "TokenNotAllowed"
  | "ExceedsPerTxCap"
  | "RecipientNotRegistered"
  | "ExceedsDailyCap";

export type AgentPreview =
  | { ok: true; remainingAfter: bigint }
  | {
      ok: false;
      reason: AgentBlockReason;
      message: string;
      /** The owner can still approve this payment themselves (the human path has no caps). */
      needsHuman: boolean;
    };

/** Budget left in the current rolling 24h window. */
export function remainingDaily(policy: AgentPolicy, usage: AgentUsage, nowSec: bigint): bigint {
  if (nowSec >= usage.windowStart + WINDOW_SECONDS) return policy.dailyCap;
  return usage.spent >= policy.dailyCap ? 0n : policy.dailyCap - usage.spent;
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function block(reason: AgentBlockReason, needsHuman: boolean): AgentPreview {
  return { ok: false, reason, message: SETTLEMENT_ERROR_MESSAGES[reason], needsHuman };
}

/**
 * Client-side mirror of the contract's policy checks, in the same order as `settleAsAgent`.
 * It exists to explain a block before any gas is spent. The contract remains the authority.
 */
export function previewAgentPayment(input: {
  policy: AgentPolicy;
  usage: AgentUsage;
  amount: bigint;
  token: Address;
  recipientRegistered: boolean;
  nowSec: bigint;
}): AgentPreview {
  const { policy, usage, amount, token, recipientRegistered, nowSec } = input;
  if (!policy.active) return block("NoActivePolicy", false);
  if (nowSec > policy.expiry) return block("PolicyExpired", false);
  if (!eq(token, policy.token)) return block("TokenNotAllowed", true);
  if (amount > policy.perTxCap) return block("ExceedsPerTxCap", true);
  if (policy.registeredOnly && !recipientRegistered) return block("RecipientNotRegistered", true);
  const remaining = remainingDaily(policy, usage, nowSec);
  if (amount > remaining) return block("ExceedsDailyCap", true);
  return { ok: true, remainingAfter: remaining - amount };
}

export interface PolicyFormInput {
  agent: string;
  owner?: string;
  perTx: string;
  daily: string;
  days: number;
  registeredOnly: boolean;
}

export type PolicyFormField = "agent" | "perTx" | "daily" | "days";

export type PolicyFormResult =
  | {
      ok: true;
      value: {
        agent: Address;
        perTxCap: bigint;
        dailyCap: bigint;
        expiry: bigint;
        registeredOnly: boolean;
      };
    }
  | { ok: false; errors: Partial<Record<PolicyFormField, string>> };

const AMOUNT = /^\d+(\.\d{1,6})?$/;

function parseAmount(raw: string, decimals: number): bigint | null {
  const t = raw.trim();
  if (!AMOUNT.test(t)) return null;
  try {
    const v = parseUnits(t, decimals);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

/** Validate the grant-permission form with the same bounds the contract enforces. */
export function parsePolicyForm(
  input: PolicyFormInput,
  nowSec: bigint,
  decimals = 6,
): PolicyFormResult {
  const errors: Partial<Record<PolicyFormField, string>> = {};
  const agent = input.agent.trim();

  if (!isAddress(agent)) errors.agent = "Enter a valid agent wallet address.";
  else if (/^0x0{40}$/i.test(agent)) errors.agent = "The zero address cannot be an agent.";
  else if (input.owner && eq(agent, input.owner)) errors.agent = "The agent must be a different wallet from yours.";

  const perTx = parseAmount(input.perTx, decimals);
  const daily = parseAmount(input.daily, decimals);
  if (perTx === null) errors.perTx = "Enter a positive amount (up to 6 decimals).";
  if (daily === null) errors.daily = "Enter a positive amount (up to 6 decimals).";
  if (perTx !== null && daily !== null && daily < perTx) {
    errors.daily = "The daily limit must be at least the per-payment limit.";
  }

  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 30) {
    errors.days = "Choose between 1 and 30 days.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      agent: agent as Address,
      perTxCap: perTx!,
      dailyCap: daily!,
      expiry: nowSec + BigInt(input.days) * 86_400n - EXPIRY_BUFFER_SECONDS,
      registeredOnly: input.registeredOnly,
    },
  };
}
