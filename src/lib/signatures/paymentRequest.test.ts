import { describe, expect, it } from "vitest";
import { hashTypedData } from "viem";
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

/** A fixed stand-in for the deployed PayGuardSettlement address. */
const SETTLEMENT = "0x00000000000000000000000000000000000fa11e" as Address;
const OTHER_SETTLEMENT = "0x00000000000000000000000000000000000fa11f" as Address;

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
    const typed = buildPaymentRequestTypedData(data, SETTLEMENT);
    const signature = await account.signTypedData(typed);
    const signer = await recoverPaymentRequestSigner(data, signature, SETTLEMENT);
    expect(signer?.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("digest changes when amount changes (tamper detection)", () => {
    const a = paymentRequestDigest(makeData({ amount: "50000000" }), SETTLEMENT);
    const b = paymentRequestDigest(makeData({ amount: "50000001" }), SETTLEMENT);
    expect(a).not.toBe(b);
  });

  it("digest changes when recipient changes", () => {
    const a = paymentRequestDigest(makeData(), SETTLEMENT);
    const b = paymentRequestDigest(
      makeData({ recipient: "0x2222222222222222222222222222222222222222" as Address }),
      SETTLEMENT,
    );
    expect(a).not.toBe(b);
  });

  it("digest changes when chain changes", () => {
    const a = paymentRequestDigest(makeData(), SETTLEMENT);
    const b = paymentRequestDigest(makeData({ chainId: 1 }), SETTLEMENT);
    expect(a).not.toBe(b);
  });

  it("digest changes when token changes", () => {
    const a = paymentRequestDigest(makeData(), SETTLEMENT);
    const b = paymentRequestDigest(
      makeData({ token: "0x3333333333333333333333333333333333333333" as Address }),
      SETTLEMENT,
    );
    expect(a).not.toBe(b);
  });

  it("recovers a different signer for a different key", async () => {
    const data = makeData();
    const other = privateKeyToAccount(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    );
    const signature = await other.signTypedData(buildPaymentRequestTypedData(data, SETTLEMENT));
    const signer = await recoverPaymentRequestSigner(data, signature, SETTLEMENT);
    expect(signer?.toLowerCase()).toBe(other.address.toLowerCase());
    expect(signer?.toLowerCase()).not.toBe(account.address.toLowerCase());
  });

  it("encode/decode round-trips a signed request", async () => {
    const data = makeData();
    const signature = await account.signTypedData(buildPaymentRequestTypedData(data, SETTLEMENT));
    const signed = {
      ...data,
      verifyingContract: SETTLEMENT,
      signature,
      signer: account.address,
    };
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

  it("digest changes when the verifying contract changes (no cross-deployment replay)", () => {
    const a = paymentRequestDigest(makeData(), SETTLEMENT);
    const b = paymentRequestDigest(makeData(), OTHER_SETTLEMENT);
    expect(a).not.toBe(b);
  });

  it("a signature for one contract does not recover the signer on another", async () => {
    const data = makeData();
    const signature = await account.signTypedData(
      buildPaymentRequestTypedData(data, SETTLEMENT),
    );
    const onOther = await recoverPaymentRequestSigner(data, signature, OTHER_SETTLEMENT);
    expect(onOther?.toLowerCase()).not.toBe(account.address.toLowerCase());
  });

  it("changing any protected field breaks signer recovery", async () => {
    const data = makeData();
    const signature = await account.signTypedData(
      buildPaymentRequestTypedData(data, SETTLEMENT),
    );
    const tampered: Partial<PaymentRequestData>[] = [
      { amount: "50000001" },
      { recipient: "0x2222222222222222222222222222222222222222" },
      { token: "0x3333333333333333333333333333333333333333" },
      { chainId: 1 },
      { reference: "INV-9999" },
      { purpose: "Something else" },
      { expiresAt: String(Number(data.expiresAt) + 1) },
      { nonce: generateNonce() },
      { payer: "0x4444444444444444444444444444444444444444" },
    ];
    for (const change of tampered) {
      const signer = await recoverPaymentRequestSigner(
        { ...data, ...change },
        signature,
        SETTLEMENT,
      );
      expect(signer?.toLowerCase(), JSON.stringify(change)).not.toBe(
        account.address.toLowerCase(),
      );
    }
  });

  it("decode rejects structurally invalid fields", async () => {
    const data = makeData();
    const signature = await account.signTypedData(
      buildPaymentRequestTypedData(data, SETTLEMENT),
    );
    const good = {
      ...data,
      verifyingContract: SETTLEMENT,
      signature,
      signer: account.address,
    };
    expect(decodeSignedRequest(encodeSignedRequest(good))).not.toBeNull();

    const bad = (patch: Record<string, unknown>) =>
      decodeSignedRequest(JSON.stringify({ v: 2, ...good, ...patch }));
    expect(bad({ amount: "-5" })).toBeNull();
    expect(bad({ amount: "1.5" })).toBeNull();
    expect(bad({ nonce: "not-hex" })).toBeNull();
    expect(bad({ nonce: "0x1234" })).toBeNull(); // must be exactly 32 bytes
    expect(bad({ recipient: "0xabc" })).toBeNull();
    expect(bad({ verifyingContract: undefined })).toBeNull();
    expect(bad({ chainId: "44005" })).toBeNull();
    expect(bad({ signature: "nope" })).toBeNull();
    // v1 (pre-settlement) requests are rejected: they cannot be settled on-chain
    expect(decodeSignedRequest(JSON.stringify({ ...good, v: 1 }))).toBeNull();
  });

  it("matches the Solidity vector (see PayGuardSettlementVectorTest)", () => {
    const digest = hashTypedData({
      domain: {
        name: "PayGuard",
        version: "1",
        chainId: 44005,
        verifyingContract: "0x00000000000000000000000000000000000fa11e",
      },
      types: {
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
      },
      primaryType: "PaymentRequest",
      message: {
        recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        payer: "0x0000000000000000000000000000000000000000",
        chainId: 44005n,
        token: "0x456569838f1d43009A91ebA4263147Afd7233483",
        amount: 50_000_000n,
        reference: "INV-1042",
        purpose: "Design invoice",
        expiresAt: 1_900_000_000n,
        nonce: "0x0000000000000000000000000000000000000000000000000000000000000001",
      },
    });
    // Same constant as EXPECTED_DIGEST in contracts/test/PayGuardSettlement.t.sol.
    expect(digest).toBe(SOLIDITY_VECTOR_DIGEST);

    // ...and the library helper produces the identical digest for the same inputs.
    const viaLib = paymentRequestDigest(
      {
        recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        payer: "0x0000000000000000000000000000000000000000",
        chainId: 44005,
        token: "0x456569838f1d43009A91ebA4263147Afd7233483",
        amount: "50000000",
        reference: "INV-1042",
        purpose: "Design invoice",
        expiresAt: "1900000000",
        nonce: "0x0000000000000000000000000000000000000000000000000000000000000001",
      },
      SETTLEMENT,
    );
    expect(viaLib).toBe(SOLIDITY_VECTOR_DIGEST);
  });
});

const SOLIDITY_VECTOR_DIGEST =
  "0xfdb7657e27eca5c31481db90debfb2f211a64f55218fb5316c64e7871f57cbc5";
