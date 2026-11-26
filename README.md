# PayGuard AI

**Verify Before You Pay.** — AI-powered Confirmation of Payee for stablecoin payments on QDay Aevum.

PayGuard AI protects stablecoin payments by helping users verify recipient wallets, validate
cryptographically signed payment requests, identify suspicious payment details, understand
transaction risks, and authorize payments safely.

## The core idea: Verified Payment Requests

Recipients create **EIP-712 signed payment requests** that bind:

- recipient wallet, optional intended payer
- chain ID, token address, amount (base units)
- payment reference, purpose, expiration, unique nonce

The payer imports the request and PayGuard independently verifies the signature and every
protected field. If the recipient, amount, token, or chain changes, verification fails.

A deterministic (non-LLM) risk engine then produces an explainable risk report, and the human
always authorizes the final `tUSD8` ERC-20 transfer in their own wallet.

## Stack

- **Frontend:** Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4
- **Web3:** wagmi 3, viem, Reown AppKit (WalletConnect), EIP-712 typed data
- **Contracts:** Solidity ^0.8.24, Foundry (`PayGuardRegistry`)
- **AI:** Google Gemini via a server-side Next.js route (`/api/assistant`), Zod-validated output
- **Tests:** Vitest + Foundry

## Quick start

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (free at dashboard.reown.com) to enable wallet
connections. Optionally set `NEXT_PUBLIC_PAYGUARD_REGISTRY` after deploying the registry contract,
and `GEMINI_API_KEY` for the AI assistant.

See `docs/DEPLOYMENT.md` for contract deployment and `docs/TESTING.md` for test commands.

## Demo flow

1. **Recipient** opens *Create Request*, signs a 50 tUSD8 payment request, shares the JSON.
2. **Payer** opens *New Payment*, pastes the request — signature, recipient, registry status, and
   risk report are shown.
3. Payer reviews and authorizes the transfer; PayGuard waits for the on-chain receipt.
4. Tamper with any field (amount, recipient, token) — verification fails with
   `SIGNATURE_MISMATCH` / `PAYMENT_DETAILS_MISMATCH` and `DO_NOT_PROCEED`.

## Important limitations

- Testnet software. Not audited. Not financial advice.
- A valid signature proves wallet control and agreement to payment details — **not** legal
  identity or legitimacy.
- Registry registration is opt-in evidence, not identity verification.
- The AI assistant prepares drafts and explains findings; it cannot sign or send transactions.

## Repository layout

```
src/app/          routes (dashboard, new-payment, verify, request, assistant, history, register, settings, public pages)
src/components/   app shell + UI primitives
src/features/     payments, recipients, verification, risk, assistant, wallet
src/lib/          blockchain, signatures, risk-engine, storage, validation
src/types/        shared types
contracts/        PayGuardRegistry.sol + Foundry tests + deploy script
docs/             architecture, security, deployment, testing, submission docs
```
