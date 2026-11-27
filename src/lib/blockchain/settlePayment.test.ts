import { describe, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  settleSignedRequest,
  SettlementFlowError,
  type SettleDeps,
  type SettleStage,
} from "./settlePayment";
import { settlementAbi } from "./settlement";
import {
  buildPaymentRequestTypedData,
  generateNonce,
  paymentRequestDigest,
} from "@/lib/signatures/paymentRequest";
import { QDAY, TUSD8 } from "@/constants/app";
import type { PaymentRequestData, SignedPaymentRequest } from "@/types";

const SETTLEMENT = "0x00000000000000000000000000000000000fa11e" as Address;
const PAYER = "0x2222222222222222222222222222222222222222" as Address;
const recipient = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

async function makeSigned(over: Partial<PaymentRequestData> = {}): Promise<SignedPaymentRequest> {
  const data: PaymentRequestData = {
    recipient: recipient.address,
    payer: "0x0000000000000000000000000000000000000000",
    chainId: QDAY.chainId,
    token: TUSD8.address,
    amount: "50000000",
    reference: "INV-1042",
    purpose: "Design invoice",
    expiresAt: String(Math.floor(Date.now() / 1000) + 3600),
    nonce: generateNonce(),
    ...over,
  };
  const signature = await recipient.signTypedData(buildPaymentRequestTypedData(data, SETTLEMENT));
  return { ...data, verifyingContract: SETTLEMENT, signature, signer: recipient.address };
}

function settledLog(req: SignedPaymentRequest, over: { amount?: bigint; hash?: Hex } = {}): Log {
  const topics = encodeEventTopics({
    abi: settlementAbi,
    eventName: "PaymentSettled",
    args: {
      requestHash: over.hash ?? paymentRequestDigest(req, SETTLEMENT),
      recipient: req.recipient,
      payer: PAYER,
    },
  });
  const data = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "string" }],
    [
      "0x0000000000000000000000000000000000000000",
      req.token,
      over.amount ?? BigInt(req.amount),
      req.reference,
    ],
  );
  return { address: SETTLEMENT, topics, data } as unknown as Log;
}

function makeDeps(req: SignedPaymentRequest, o: Partial<SettleDeps> = {}, logs?: Log[]) {
  const calls: string[] = [];
  const deps: SettleDeps = {
    settlement: SETTLEMENT,
    checkRequest: vi.fn(async () => {
      calls.push("check");
      return { status: 0, hash: paymentRequestDigest(req, SETTLEMENT) };
    }),
    allowance: vi.fn(async () => {
      calls.push("allowance");
      return 0n;
    }),
    approve: vi.fn(async () => {
      calls.push("approve");
      return "0xa1" as Hex;
    }),
    settle: vi.fn(async () => {
      calls.push("settle");
      return "0x51" as Hex;
    }),
    waitForReceipt: vi.fn(async (h: Hex) => {
      calls.push(`wait:${h}`);
      return { status: "success" as const, logs: h === "0x51" ? (logs ?? [settledLog(req)]) : [] };
    }),
    ...o,
  };
  return { deps, calls };
}

describe("settleSignedRequest", () => {
  it("approves the exact amount, settles, and verifies the on-chain event", async () => {
    const req = await makeSigned();
    const { deps, calls } = makeDeps(req);
    const stages: SettleStage[] = [];
    const res = await settleSignedRequest(deps, req, PAYER, (s) => stages.push(s));

    expect(deps.approve).toHaveBeenCalledWith(req.token, SETTLEMENT, 50_000_000n); // exact, not unlimited
    expect(calls).toEqual(["check", "allowance", "approve", "wait:0xa1", "settle", "wait:0x51"]);
    expect(stages).toEqual(["checking", "approving", "approval-confirming", "settling", "confirming"]);
    expect(res.txHash).toBe("0x51");
    expect(res.approvalTxHash).toBe("0xa1");
    expect(res.requestHash).toBe(paymentRequestDigest(req, SETTLEMENT));
  });

  it("skips approval when the allowance already covers the amount", async () => {
    const req = await makeSigned();
    const { deps, calls } = makeDeps(req, { allowance: vi.fn(async () => 50_000_000n) });
    const res = await settleSignedRequest(deps, req, PAYER);
    expect(deps.approve).not.toHaveBeenCalled();
    expect(calls).toEqual(["check", "settle", "wait:0x51"]);
    expect(res.approvalTxHash).toBeUndefined();
  });

  it("sends nothing when the contract pre-flight rejects (tampered/invalid signature)", async () => {
    const req = await makeSigned();
    const { deps } = makeDeps(req, {
      checkRequest: vi.fn(async () => ({ status: 6, hash: "0x00" as Hex })), // InvalidSignature
    });
    await expect(settleSignedRequest(deps, req, PAYER)).rejects.toMatchObject({
      code: "InvalidSignature",
    });
    expect(deps.approve).not.toHaveBeenCalled();
    expect(deps.settle).not.toHaveBeenCalled();
  });

  it.each([
    [1, "RequestExpired"],
    [2, "WrongChain"],
    [3, "WrongPayer"],
    [4, "InvalidRequest"],
    [5, "NonceAlreadyUsed"],
  ])("maps pre-flight status %i to %s with a plain-language message", async (status, code) => {
    const req = await makeSigned();
    const { deps } = makeDeps(req, {
      checkRequest: vi.fn(async () => ({ status, hash: "0x00" as Hex })),
    });
    const err = await settleSignedRequest(deps, req, PAYER).catch((e) => e);
    expect(err).toBeInstanceOf(SettlementFlowError);
    expect(err.code).toBe(code);
    expect(err.message.length).toBeGreaterThan(10);
  });

  it("blocks when the contract and app disagree on the digest", async () => {
    const req = await makeSigned();
    const { deps } = makeDeps(req, {
      checkRequest: vi.fn(async () => ({ status: 0, hash: ("0x" + "11".repeat(32)) as Hex })),
    });
    await expect(settleSignedRequest(deps, req, PAYER)).rejects.toMatchObject({
      code: "DigestMismatch",
    });
    expect(deps.settle).not.toHaveBeenCalled();
  });

  it("does not settle if the approval transaction fails", async () => {
    const req = await makeSigned();
    const { deps } = makeDeps(req, {
      waitForReceipt: vi.fn(async () => ({ status: "reverted" as const, logs: [] })),
    });
    await expect(settleSignedRequest(deps, req, PAYER)).rejects.toMatchObject({
      code: "ApprovalFailed",
    });
    expect(deps.settle).not.toHaveBeenCalled();
  });

  it("fails when the settle transaction reverts on-chain", async () => {
    const req = await makeSigned();
    const wait = vi.fn(async (h: Hex) => ({
      status: (h === "0x51" ? "reverted" : "success") as "success" | "reverted",
      logs: [],
    }));
    const { deps } = makeDeps(req, { waitForReceipt: wait });
    await expect(settleSignedRequest(deps, req, PAYER)).rejects.toMatchObject({
      code: "SettleReverted",
    });
  });

  it("does not report success when the receipt has no matching PaymentSettled event", async () => {
    const req = await makeSigned();
    const { deps } = makeDeps(req, {}, []);
    await expect(settleSignedRequest(deps, req, PAYER)).rejects.toMatchObject({
      code: "NoSettlementEvent",
    });
  });

  it("rejects an event whose amount differs from the signed request", async () => {
    const req = await makeSigned();
    const { deps } = makeDeps(req, {}, [settledLog(req, { amount: 1n })]);
    await expect(settleSignedRequest(deps, req, PAYER)).rejects.toMatchObject({
      code: "EventMismatch",
    });
  });

  it("ignores events for a different request hash", async () => {
    const req = await makeSigned();
    const { deps } = makeDeps(req, {}, [settledLog(req, { hash: ("0x" + "22".repeat(32)) as Hex })]);
    await expect(settleSignedRequest(deps, req, PAYER)).rejects.toMatchObject({
      code: "NoSettlementEvent",
    });
  });
});
