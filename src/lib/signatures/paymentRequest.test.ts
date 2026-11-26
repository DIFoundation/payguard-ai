import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { isAddress, type Address } from "viem";
import {
  buildPaymentRequestTypedData,
  decodeSignedRequest,
  encodeSignedRequest,
  generateNonce,
  paymentRequestDigest,
  recoverPaymentRequestSigner,
} from "./paymentRequest";
import { QDAY, TUSD8 } from "@/constants/app";
import type { PaymentRequestData } from "@/types";

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

function makeData(overrides: Partial<PaymentRequestData> = {}): PaymentRequestData {
  return {
    recipient: account.address,
    payer: "0x0000000000000000000000000000000000000000",
    chainId: QDAY.chainId,
    token: TUSD8.address,
    amount: "50000000",
    reference: "INV-1042",
    purpose: "Design invoice",
    expiresAt: String(Math.floor(Date.now() / 1000) + 86400),
    nonce: generateNonce(),
    ...overrides,
  };
}

describe("payment request EIP-712", () => {
  it("round-trips sign and recover", async () => {
    const data = makeData();
    const typed = buildPaymentRequestTypedData(data);
    const signature = await account.signTypedData(typed);
    const signer = await recoverPaymentRequestSigner(data, signature);
    expect(signer?.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("digest changes when amount changes (tamper detection)", () => {
    const a = paymentRequestDigest(makeData({ amount: "50000000" }));
    const b = paymentRequestDigest(makeData({ amount: "50000001" }));
    expect(a).not.toBe(b);
  });

  it("digest changes when recipient changes", () => {
    const a = paymentRequestDigest(makeData());
    const b = paymentRequestDigest(
      makeData({ recipient: "0x2222222222222222222222222222222222222222" as Address }),
    );
    expect(a).not.toBe(b);
  });

  it("digest changes when chain changes", () => {
    const a = paymentRequestDigest(makeData());
    const b = paymentRequestDigest(makeData({ chainId: 1 }));
    expect(a).not.toBe(b);
  });

  it("digest changes when token changes", () => {
    const a = paymentRequestDigest(makeData());
    const b = paymentRequestDigest(
      makeData({ token: "0x3333333333333333333333333333333333333333" as Address }),
    );
    expect(a).not.toBe(b);
  });

  it("recovers a different signer for a different key", async () => {
    const data = makeData();
    const other = privateKeyToAccount(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    );
    const signature = await other.signTypedData(buildPaymentRequestTypedData(data));
    const signer = await recoverPaymentRequestSigner(data, signature);
    expect(signer?.toLowerCase()).toBe(other.address.toLowerCase());
    expect(signer?.toLowerCase()).not.toBe(account.address.toLowerCase());
  });

  it("encode/decode round-trips a signed request", async () => {
    const data = makeData();
    const signature = await account.signTypedData(buildPaymentRequestTypedData(data));
    const signed = { ...data, signature, signer: account.address };
    const encoded = encodeSignedRequest(signed);
    const decoded = decodeSignedRequest(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.amount).toBe(data.amount);
    expect(decoded!.signature).toBe(signature);
    expect(isAddress(decoded!.recipient)).toBe(true);
  });

  it("decode rejects malformed input", () => {
    expect(decodeSignedRequest("not json")).toBeNull();
    expect(decodeSignedRequest('{"v":2}')).toBeNull();
    expect(decodeSignedRequest('{"v":1,"recipient":"0x"}')).toBeNull();
  });
});
