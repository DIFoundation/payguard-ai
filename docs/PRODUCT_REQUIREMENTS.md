# Product Requirements

## Product

**PayGuard AI** — "Verify Before You Pay." AI-powered Confirmation of Payee for stablecoin
payments on QDay Aevum Testnet (chain 44005).

## Users (one product, one flow)

- Individuals making stablecoin payments (payer).
- Freelancers/merchants receiving payments (recipient → create signed requests).
- Businesses verifying vendor wallets.
- AI agents preparing payment drafts — never signing or executing.

## Functional requirements

### FR-1 Wallet & network
- Connect via Reown AppKit (WalletConnect) / injected wallets.
- Detect and switch to QDay Aevum (chainId 44005).
- Read native (tQDAY) and tUSD8 balances.

### FR-2 Verified Payment Requests (core differentiator)
- EIP-712 `PaymentRequest` typed data signed by the recipient.
- Protected fields: recipient, payer, chainId, token, amount, reference, purpose, expiresAt, nonce.
- Portable JSON encoding; payer-side signature recovery and field-by-field verification.
- Any change to a protected field must fail verification.

### FR-3 Recipient verification statuses
`VERIFIED_PAYMENT_REQUEST`, `REGISTERED_RECIPIENT`, `WALLET_CONTROL_VERIFIED`,
`UNREGISTERED_RECIPIENT`, `SIGNATURE_MISMATCH`, `PAYMENT_DETAILS_MISMATCH`,
`EXPIRED_REQUEST`, `VERIFICATION_UNAVAILABLE` — each with a plain-language explanation of its
meaning and limits.

### FR-4 Deterministic risk engine
- Client-side, versioned ruleset; LLM is never the risk authority.
- Checks: invalid/zero recipient, wrong chain/token, invalid amount, expired request,
  invalid signature, signer/recipient mismatch, payer mismatch, detail mismatch,
  unregistered recipient, contract destination, insufficient balance, missing evidence.
- Severities: info/low/medium/high/critical → PROCEED / PROCEED_WITH_CAUTION /
  REVIEW_REQUIRED / DO_NOT_PROCEED.
- Critical mismatches cannot be overridden by positive signals.

### FR-5 Payment execution
- Direct `tUSD8.transfer()` via the user's wallet. No router, no approvals, no unlimited spend.
- Wait for a real transaction receipt; verify expected Transfer event context; handle failures.
- Local payment history distinguishing drafts from confirmed transactions.

### FR-6 Registry contract
- `PayGuardRegistry.sol`: register / revoke / isRegistered / getRecipient.
- Wallet-owner-only actions; events; no funds held; no admin privileges.

### FR-7 AI assistant
- Natural-language → structured draft (Zod-validated) via `/api/assistant`.
- Explains risk findings; cannot sign, send, approve, or override risk results.

### FR-8 UX
- Dark fintech design system; responsive; mobile-usable.
- Pages: landing, how-it-works, about, docs + dashboard, new-payment, verify, request,
  assistant, history, register, settings.

## Non-functional requirements

- No traditional backend/DB/auth. localStorage only for non-sensitive data.
- Integer base units for all amounts; no floating-point money math.
- Secrets only server-side (`GEMINI_API_KEY`); nothing sensitive in NEXT_PUBLIC vars.
- All critical checks re-run against chain — localStorage is never evidence.

## Out of scope (unless time permits)

- ERC-8004 / ERC-4337 / x402 integrations (stretch goals only).
- fiat ramps, fiat CoP rails, multi-chain support.
