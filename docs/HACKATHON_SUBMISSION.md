# Hackathon Submission — PayGuard AI

**Event:** QDay Aevum Builder Challenge
**Category:** Confirmation of Payee — AI-powered stablecoin payment protection
**Tagline:** Verify Before You Pay.

## The problem

Stablecoin transfers are irreversible and pseudonymous. One wrong address, an altered invoice,
or a replayed payment request can move funds permanently. Traditional finance solved recipient
deception with Confirmation of Payee (CoP); PayGuard brings that protection on-chain.

## What we built

A frontend-first Web3 app where:

1. **Recipients sign payment requests** — an EIP-712 `PaymentRequest` binds recipient, optional
   payer, chain, token, amount, reference, purpose, expiry, and nonce.
2. **Payers independently verify** — signature recovery, field-by-field comparison, on-chain
   registry lookup, contract detection, balance checks.
3. **A deterministic risk engine explains** — versioned rules produce severity-rated findings with
   evidence sources and recommended actions; the LLM never decides risk.
4. **Humans authorize** — a plain `tUSD8.transfer()` settles on QDay Aevum; PayGuard waits for a
   real receipt.

Plus: a minimal `PayGuardRegistry` contract (wallet opt-in, no funds, no admin), an AI assistant
that prepares drafts and explains findings (Gemini, server-side key, Zod-validated), and a
complete dark fintech UI.

## Why it wins on differentiation

- **Tamper-evident by construction:** change one protected field → signature fails →
  `DO_NOT_PROCEED`. The demo contrast (legit request passes, altered request fails) is the
  centerpiece.
- **Honest verification:** statuses explain their own limits; unregistered ≠ malicious;
  missing info ≠ negative evidence.
- **Real settlement:** actual tUSD8 transfers on Aevum with receipt monitoring — not mocks.
- **Security posture:** no approvals, no router, no custody, no backend secrets.

## Demo script (≈5 min)

1. **Recipient side:** connect wallet → *Create Request* → 50 tUSD8, purpose "design invoice" →
   sign → copy JSON.
2. **Payer side:** *New Payment* → paste JSON → show `VERIFIED_PAYMENT REQUEST` status, registry
   state, and the green risk report.
3. Review screen → authorize in wallet → show confirming state → receipt + explorer link.
4. **The twist:** paste a modified request (change amount or recipient in the JSON) → signature
   verification fails → `SIGNATURE_MISMATCH` / `PAYMENT_DETAILS_MISMATCH` → `DO_NOT_PROCEED`.
5. Optional: *Verify* page for bare addresses; *Assistant* to draft a payment from natural language.

## What is real vs. deferred

- **Real:** full payment flow, EIP-712 verification, risk engine, registry contract + tests,
  AI assistant proxy, local history, responsive UI.
- **Deferred (stretch):** ERC-8004 / ERC-4337 / x402 — no verified Aevum deployments confirmed;
  intentionally not fabricated.
- **Known gaps:** Playwright e2e not yet written; contract deployment address pending deployer
  key; light theme stubbed.

## Links

- Repo: `payguard-ai`
- Contract: `contracts/src/PayGuardRegistry.sol` (Foundry, 7/7 tests passing)
- Docs: `docs/` (architecture, requirements, contract spec, security, testing, deployment)
