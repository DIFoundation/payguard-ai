import { describe, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { settleAsAgentFlow, AgentBlockedError, type AgentDeps } from "./agentSettle";
import { tamperRequest } from "./attack";
import type { AgentPolicy, AgentUsage } from "./policy";
import { settlementAbi } from "@/lib/blockchain/settlement";
import { SettlementFlowError } from "@/lib/blockchain/settlePayment";
import {
  buildPaymentRequestTypedData,
  generateNonce,
  paymentRequestDigest,
  recoverPaymentRequestSigner,
} from "@/lib/signatures/paymentRequest";
import { QDAY, TUSD8 } from "@/constants/app";
import type { PaymentRequestData, SignedPaymentRequest } from "@/types";

const SETTLEMENT = "0x00000000000000000000000000000000000fa11e" as Address;
const OWNER = "0x2222222222222222222222222222222222222222" as Address;
const AGENT = "0x5555555555555555555555555555555555555555" as Address;
const NOW = 1_800_000_000n;
const ONE = 1_000_000n;
const recipient = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

async function makeSigned(amount = "50000000"): Promise<SignedPaymentRequest> {
  const data: PaymentRequestData = {
    recipient: recipient.address,
    payer: "0x0000000000000000000000000000000000000000",
    chainId: QDAY.chainId,
    token: TUSD8.address,
    amount,
    reference: "INV-7",
    purpose: "Agent-paid invoice",
    expiresAt: String(NOW + 3600n),
    nonce: generateNonce(),
  };
  const signature = await recipient.signTypedData(buildPaymentRequestTypedData(data, SETTLEMENT));
  return { ...data, verifyingContract: SETTLEMENT, signature, signer: recipient.address };
}

const policy = (o: Partial<AgentPolicy> = {}): AgentPolicy => ({
  token: TUSD8.address,
  perTxCap: 100n * ONE,
  dailyCap: 300n * ONE,
  expiry: NOW + 86_400n,
  registeredOnly: false,
  active: true,
  ...o,
});
const usage: AgentUsage = { windowStart: 0n, spent: 0n };

function logFor(req: SignedPaymentRequest, agent: Address = AGENT): Log {
  const topics = encodeEventTopics({
    abi: settlementAbi,
    eventName: "PaymentSettled",
    args: { requestHash: paymentRequestDigest(req, SETTLEMENT), recipient: req.recipient, payer: OWNER },
  });
  const data = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "string" }],
    [agent, req.token, BigInt(req.amount), req.reference],
  );
  return { address: SETTLEMENT, topics, data } as unknown as Log;
}

function makeDeps(req: SignedPaymentRequest, o: Partial<AgentDeps> = {}, logs?: Log[]) {
  const deps: AgentDeps = {
    settlement: SETTLEMENT,
    agent: AGENT,
    readPolicy: vi.fn(async () => ({ policy: policy(), usage })),
    isRegistered: vi.fn(async () => true),
    checkRequest: vi.fn(async () => ({ status: 0, hash: paymentRequestDigest(req, SETTLEMENT) })),
    allowance: vi.fn(async () => 1_000n * ONE),
    settleAsAgent: vi.fn(async () => "0x51" as Hex),
    waitForReceipt: vi.fn(async () => ({
      status: "success" as const,
      logs: logs ?? [logFor(req)],
    })),
    nowSec: () => NOW,
    ...o,
  };
  return deps;
}

describe("settleAsAgentFlow", () => {
  it("pays within policy and verifies the event names the agent", async () => {
    const req = await makeSigned();
    const deps = makeDeps(req);
    const res = await settleAsAgentFlow(deps, OWNER, req);
    expect(deps.settleAsAgent).toHaveBeenCalledOnce();
    expect(res.txHash).toBe("0x51");
    expect(res.requestHash).toBe(paymentRequestDigest(req, SETTLEMENT));
  });

  it("never sends a transaction when the policy blocks it, and flags human escalation", async () => {
    const req = await makeSigned("150000000"); // 150 > per-tx cap 100
    const deps = makeDeps(req);
    const err = await settleAsAgentFlow(deps, OWNER, req).catch((e) => e);
    expect(err).toBeInstanceOf(AgentBlockedError);
    expect(err).toBeInstanceOf(SettlementFlowError);
    expect(err.code).toBe("ExceedsPerTxCap");
    expect(err.needsHuman).toBe(true);
    expect(deps.settleAsAgent).not.toHaveBeenCalled();
  });

  it("is blocked after the owner revokes (no active policy) and cannot escalate through the agent", async () => {
    const req = await makeSigned();
    const deps = makeDeps(req, {
      readPolicy: vi.fn(async () => ({ policy: policy({ active: false }), usage })),
    });
    await expect(settleAsAgentFlow(deps, OWNER, req)).rejects.toMatchObject({
      code: "NoActivePolicy",
      needsHuman: false,
    });
    expect(deps.settleAsAgent).not.toHaveBeenCalled();
  });

  it("respects registered-only policies", async () => {
    const req = await makeSigned();
    const deps = makeDeps(req, {
      readPolicy: vi.fn(async () => ({ policy: policy({ registeredOnly: true }), usage })),
      isRegistered: vi.fn(async () => false),
    });
    await expect(settleAsAgentFlow(deps, OWNER, req)).rejects.toMatchObject({
      code: "RecipientNotRegistered",
    });
  });

  it("stops when the owner's allowance is too low (an agent cannot approve funds)", async () => {
    const req = await makeSigned();
    const deps = makeDeps(req, { allowance: vi.fn(async () => 10n * ONE) });
    await expect(settleAsAgentFlow(deps, OWNER, req)).rejects.toMatchObject({
      code: "ERC20InsufficientAllowance",
      needsHuman: true,
    });
    expect(deps.settleAsAgent).not.toHaveBeenCalled();
  });

  it("stops on contract pre-flight rejection (expired / replayed request)", async () => {
    const req = await makeSigned();
    const deps = makeDeps(req, { checkRequest: vi.fn(async () => ({ status: 5, hash: "0x00" as Hex })) });
    await expect(settleAsAgentFlow(deps, OWNER, req)).rejects.toMatchObject({
      code: "NonceAlreadyUsed",
    });
    expect(deps.settleAsAgent).not.toHaveBeenCalled();
  });

  it("does not report success if the event names a different agent", async () => {
    const req = await makeSigned();
    const other = "0x6666666666666666666666666666666666666666" as Address;
    const deps = makeDeps(req, {}, [logFor(req, other)]);
    await expect(settleAsAgentFlow(deps, OWNER, req)).rejects.toMatchObject({ code: "EventMismatch" });
  });

  it("does not report success if the transaction reverts", async () => {
    const req = await makeSigned();
    const deps = makeDeps(req, {
      waitForReceipt: vi.fn(async () => ({ status: "reverted" as const, logs: [] })),
    });
    await expect(settleAsAgentFlow(deps, OWNER, req)).rejects.toMatchObject({ code: "SettleReverted" });
  });
});

describe("tamperRequest (prompt-injection / compromised-agent simulation)", () => {
  it("a redirected recipient no longer matches the recipient's signature", async () => {
    const req = await makeSigned();
    const evil = tamperRequest(req, "redirect-recipient", AGENT);
    expect(evil.recipient).toBe(AGENT);
    expect(evil.signature).toBe(req.signature); // attacker reuses the genuine signature
    const signer = await recoverPaymentRequestSigner(evil, evil.signature, SETTLEMENT);
    expect(signer?.toLowerCase()).not.toBe(recipient.address.toLowerCase());
  });

  it("an altered amount passes the policy but fails the contract pre-flight", async () => {
    const req = await makeSigned();
    const evil = tamperRequest(req, "alter-amount", AGENT);
    expect(evil.amount).toBe("51000000");
    expect(evil.signature).toBe(req.signature);
    const deps = makeDeps(evil, {
      checkRequest: vi.fn(async () => ({ status: 6, hash: "0x00" as Hex })), // contract: InvalidSignature
    });
    const err = await settleAsAgentFlow(deps, OWNER, evil).catch((e) => e);
    expect(err).toBeInstanceOf(AgentBlockedError);
    expect(err.code).toBe("InvalidSignature");
    expect(err.needsHuman).toBe(false);
    expect(deps.settleAsAgent).not.toHaveBeenCalled();
  });
});
