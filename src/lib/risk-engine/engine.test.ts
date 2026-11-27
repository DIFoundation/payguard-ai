import { describe, expect, it } from "vitest";
import { evaluateRisk, type RiskContext } from "./engine";
import { TUSD8, QDAY } from "@/constants/app";
import type { SignedPaymentRequest } from "@/types";

const RECIPIENT = "0x1111111111111111111111111111111111111111";
const PAYER = "0x2222222222222222222222222222222222222222";
const ZERO = "0x0000000000000000000000000000000000000000";

function makeRequest(overrides: Partial<SignedPaymentRequest> = {}): SignedPaymentRequest {
  return {
    recipient: RECIPIENT as `0x${string}`,
    payer: ZERO as `0x${string}`,
    chainId: QDAY.chainId,
    token: TUSD8.address,
    amount: "50000000",
    reference: "INV-1",
    purpose: "Invoice",
    expiresAt: String(Math.floor(Date.now() / 1000) + 3600),
    nonce: "0x" + "ab".repeat(32),
    verifyingContract: "0x00000000000000000000000000000000000fa11e",
    signature: `0x${"cd".repeat(65)}` as `0x${string}`,
    signer: RECIPIENT as `0x${string}`,
    ...overrides,
  };
}

function baseCtx(overrides: Partial<RiskContext> = {}): RiskContext {
  return {
    payer: PAYER,
    recipient: RECIPIENT,
    amount: "50000000",
    token: TUSD8.address,
    chainOk: true,
    balanceBaseUnits: "100000000",
    recipientIsContract: false,
    recipientRegistered: true,
    ...overrides,
  };
}

describe("evaluateRisk", () => {
  it("passes a clean payment", () => {
    const r = evaluateRisk(baseCtx());
    // No signed request → informational low finding, so caution is expected.
    expect(r.recommendation).toBe("PROCEED_WITH_CAUTION");
    expect(r.findings.every((f) => f.severity === "info" || f.severity === "low")).toBe(true);
  });

  it("flags zero address as critical", () => {
    const r = evaluateRisk(baseCtx({ recipient: ZERO }));
    expect(r.recommendation).toBe("DO_NOT_PROCEED");
    expect(r.findings.some((f) => f.code === "ZERO_ADDRESS" && f.severity === "critical")).toBe(true);
  });

  it("flags missing recipient", () => {
    const r = evaluateRisk(baseCtx({ recipient: null }));
    expect(r.findings.some((f) => f.code === "NO_RECIPIENT")).toBe(true);
  });

  it("flags invalid amount", () => {
    const r = evaluateRisk(baseCtx({ amount: "0" }));
    expect(r.findings.some((f) => f.code === "INVALID_AMOUNT")).toBe(true);
  });

  it("flags wrong chain as critical and cannot be overridden", () => {
    const r = evaluateRisk(baseCtx({ chainOk: false, recipientRegistered: true }));
    expect(r.recommendation).toBe("DO_NOT_PROCEED");
    expect(r.findings.some((f) => f.code === "WRONG_CHAIN")).toBe(true);
  });

  it("flags invalid signature as critical even when registered", () => {
    const req = makeRequest();
    const r = evaluateRisk(
      baseCtx({ request: req, signatureValid: false, signerMatchesRecipient: false, recipientRegistered: true }),
    );
    expect(r.recommendation).toBe("DO_NOT_PROCEED");
    expect(r.findings.some((f) => f.code === "INVALID_SIGNATURE")).toBe(true);
  });

  it("flags expired request as high", () => {
    const req = makeRequest({ expiresAt: "1" });
    const r = evaluateRisk(
      baseCtx({ request: req, signatureValid: true, signerMatchesRecipient: true, requestExpired: true }),
    );
    expect(r.findings.some((f) => f.code === "REQUEST_EXPIRED")).toBe(true);
    expect(r.recommendation).not.toBe("PROCEED");
  });

  it("flags payer mismatch as critical", () => {
    const req = makeRequest({ payer: "0x3333333333333333333333333333333333333333" as `0x${string}` });
    const r = evaluateRisk(
      baseCtx({ request: req, signatureValid: true, signerMatchesRecipient: true, payerMatchesRequest: false }),
    );
    expect(r.recommendation).toBe("DO_NOT_PROCEED");
    expect(r.findings.some((f) => f.code === "PAYER_MISMATCH")).toBe(true);
  });

  it("flags details mismatch as critical", () => {
    const req = makeRequest();
    const r = evaluateRisk(
      baseCtx({ request: req, signatureValid: true, signerMatchesRecipient: true, requestMatchesDraft: false }),
    );
    expect(r.recommendation).toBe("DO_NOT_PROCEED");
    expect(r.findings.some((f) => f.code === "DETAILS_MISMATCH")).toBe(true);
  });

  it("flags unregistered recipient as low (not malicious)", () => {
    const r = evaluateRisk(baseCtx({ recipientRegistered: false }));
    expect(r.findings.some((f) => f.code === "UNREGISTERED_RECIPIENT" && f.severity === "low")).toBe(true);
    expect(r.recommendation).toBe("PROCEED_WITH_CAUTION");
  });

  it("flags contract destination as medium", () => {
    const r = evaluateRisk(baseCtx({ recipientIsContract: true }));
    expect(r.recommendation).toBe("REVIEW_REQUIRED");
  });

  it("flags insufficient balance as high", () => {
    const r = evaluateRisk(baseCtx({ balanceBaseUnits: "1000" }));
    expect(r.findings.some((f) => f.code === "INSUFFICIENT_BALANCE")).toBe(true);
    expect(r.recommendation).toBe("DO_NOT_PROCEED");
  });

  it("missing registry info is info, not negative", () => {
    const r = evaluateRisk(baseCtx({ recipientRegistered: null }));
    expect(r.findings.some((f) => f.code === "REGISTRY_UNKNOWN")).toBe(true);
  });
});
