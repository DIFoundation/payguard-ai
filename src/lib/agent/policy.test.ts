import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import {
  parsePolicyForm,
  previewAgentPayment,
  remainingDaily,
  type AgentPolicy,
  type AgentUsage,
} from "./policy";

const TOKEN = "0x456569838f1d43009A91ebA4263147Afd7233483" as Address;
const NOW = 1_800_000_000n;
const ONE = 1_000_000n;

const policy = (over: Partial<AgentPolicy> = {}): AgentPolicy => ({
  token: TOKEN,
  perTxCap: 100n * ONE,
  dailyCap: 150n * ONE,
  expiry: NOW + 86_400n,
  registeredOnly: false,
  active: true,
  ...over,
});
const fresh: AgentUsage = { windowStart: 0n, spent: 0n };

const preview = (over: Partial<Parameters<typeof previewAgentPayment>[0]> = {}) =>
  previewAgentPayment({
    policy: policy(),
    usage: fresh,
    amount: 50n * ONE,
    token: TOKEN,
    recipientRegistered: true,
    nowSec: NOW,
    ...over,
  });

describe("previewAgentPayment (mirrors settleAsAgent)", () => {
  it("allows a payment within all limits and reports the remaining budget", () => {
    const r = preview();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remainingAfter).toBe(100n * ONE);
  });

  it("blocks with no active policy (and a human cannot fix it through the agent)", () => {
    const r = preview({ policy: policy({ active: false }) });
    expect(r).toMatchObject({ ok: false, reason: "NoActivePolicy", needsHuman: false });
  });

  it("blocks an expired session", () => {
    const r = preview({ nowSec: NOW + 86_401n });
    expect(r).toMatchObject({ ok: false, reason: "PolicyExpired" });
  });

  it("is still valid at the exact expiry second (contract uses `>`)", () => {
    expect(preview({ nowSec: NOW + 86_400n }).ok).toBe(true);
  });

  it("blocks a different token", () => {
    const other = "0x3333333333333333333333333333333333333333" as Address;
    expect(preview({ token: other })).toMatchObject({ ok: false, reason: "TokenNotAllowed" });
  });

  it("escalates above the per-payment cap", () => {
    const r = preview({ amount: 101n * ONE });
    expect(r).toMatchObject({ ok: false, reason: "ExceedsPerTxCap", needsHuman: true });
  });

  it("allows exactly the per-payment cap", () => {
    expect(preview({ amount: 100n * ONE }).ok).toBe(true);
  });

  it("blocks unregistered recipients only when registeredOnly is set", () => {
    expect(preview({ recipientRegistered: false }).ok).toBe(true);
    const r = preview({ policy: policy({ registeredOnly: true }), recipientRegistered: false });
    expect(r).toMatchObject({ ok: false, reason: "RecipientNotRegistered" });
  });

  it("enforces the rolling daily cap and resets after 24h", () => {
    const used: AgentUsage = { windowStart: NOW - 3_600n, spent: 100n * ONE };
    expect(preview({ usage: used, amount: 51n * ONE })).toMatchObject({
      ok: false,
      reason: "ExceedsDailyCap",
    });
    expect(preview({ usage: used, amount: 50n * ONE }).ok).toBe(true); // lands exactly on the cap
    const stale: AgentUsage = { windowStart: NOW - 86_400n, spent: 150n * ONE };
    expect(preview({ usage: stale, amount: 100n * ONE }).ok).toBe(true); // window rolled over
  });

  it("checks per-tx cap before daily cap, like the contract", () => {
    const used: AgentUsage = { windowStart: NOW, spent: 150n * ONE };
    expect(preview({ usage: used, amount: 101n * ONE })).toMatchObject({
      reason: "ExceedsPerTxCap",
    });
  });
});

describe("remainingDaily", () => {
  it("never underflows", () => {
    expect(
      remainingDaily(policy(), { windowStart: NOW, spent: 999n * ONE }, NOW),
    ).toBe(0n);
  });
});

describe("parsePolicyForm", () => {
  const good = {
    agent: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    owner: "0x2222222222222222222222222222222222222222",
    perTx: "100",
    daily: "300.5",
    days: 7,
    registeredOnly: true,
  };

  it("parses a valid form into base units and a buffered expiry", () => {
    const r = parsePolicyForm(good, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.perTxCap).toBe(100_000_000n);
      expect(r.value.dailyCap).toBe(300_500_000n);
      expect(r.value.expiry).toBe(NOW + 7n * 86_400n - 600n);
      expect(r.value.registeredOnly).toBe(true);
    }
  });

  it("a 30-day session stays within the contract's 30-day maximum", () => {
    const r = parsePolicyForm({ ...good, days: 30 }, NOW);
    expect(r.ok && r.value.expiry <= NOW + 30n * 86_400n).toBe(true);
  });

  it.each([
    [{ agent: "nope" }, "agent"],
    [{ agent: "0x0000000000000000000000000000000000000000" }, "agent"],
    [{ agent: "0x2222222222222222222222222222222222222222" }, "agent"], // same as owner
    [{ perTx: "0" }, "perTx"],
    [{ perTx: "1.1234567" }, "perTx"],
    [{ perTx: "-5" }, "perTx"],
    [{ daily: "abc" }, "daily"],
    [{ perTx: "100", daily: "50" }, "daily"], // daily < per-tx
    [{ days: 0 }, "days"],
    [{ days: 31 }, "days"],
    [{ days: 1.5 }, "days"],
  ])("rejects invalid input %j", (patch, field) => {
    const r = parsePolicyForm({ ...good, ...patch }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[field as keyof typeof r.errors]).toBeTruthy();
  });
});
