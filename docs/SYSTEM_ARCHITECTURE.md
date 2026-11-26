# System Architecture

PayGuard AI is a **frontend-first** application. There is no database, no auth system, and no
custom backend. The only server-side code is a thin Next.js route handler that proxies requests
to the Gemini API.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (client)                          │
│                                                                  │
│  wagmi / viem ──► QDay Aevum RPC (eth_call, eth_sendTransaction)│
│       │                                                          │
│       ├─ EIP-712 signTypedData (recipient request signing)       │
│       ├─ ERC-20 transfer() (payer authorization)                 │
│       ├─ PayGuardRegistry reads (isRegistered / getRecipient)    │
│       ├─ eth_getCode (contract detection)                        │
│       ├─ balanceOf reads (tUSD8 + native)                        │
│       │                                                          │
│       ├─ src/lib/signatures   EIP-712 build / recover / codec    │
│       ├─ src/lib/risk-engine  deterministic rules (v1.0.0)       │
│       ├─ src/lib/storage      localStorage (non-sensitive only)  │
│       └─ src/features/*       UI flows                           │
└─────────────────────────────────────────────────────────────────┘
            │                                        │
            │ POST /api/assistant                   │ RPC / WS
            ▼                                        ▼
┌───────────────────────┐                ┌──────────────────────────┐
│ Next.js route handler │                │ QDay Aevum Testnet       │
│ (server, no secrets   │                │ chain 44005              │
│  exposed to client)   │                │ tUSD8 · PayGuardRegistry │
│        │              │                └──────────────────────────┘
│        ▼              │
│ Google Gemini API     │
│ (structured JSON,     │
│  Zod-validated)       │
└───────────────────────┘
```

## Data flows

### Payment request lifecycle

1. **Create:** recipient wallet signs `PaymentRequest` typed data
   (`recipient, payer, chainId, token, amount, reference, purpose, expiresAt, nonce`).
   Domain: `PayGuard / 1 / chainId`.
2. **Encode:** `{v:1, ...fields, signature, signer}` → portable JSON.
3. **Import & verify (payer side):**
   - `recoverTypedDataAddress` recovers signer → must equal `recipient`.
   - `chainId`, `token`, `expiresAt`, `payer` checked against live context.
   - Registry `isRegistered(recipient)` read on-chain.
   - `eth_getCode(recipient)` detects contract destinations.
   - Draft fields compared against request fields (`requestMatchesDraft`).
4. **Risk:** all facts feed `evaluateRisk()` → findings + recommendation.
5. **Pay:** standard `tUSD8.transfer(recipient, amount)` — user signs in wallet.
6. **Confirm:** `useWaitForTransactionReceipt` waits for a real receipt; local history updated.

### Trust boundaries

- **Never trusted:** localStorage (drafts, history, cached verification).
- **Always re-verified on-chain:** registration status, contract code, balances, receipt status.
- **Signature = wallet control evidence**, not identity.
- **AI output = draft suggestion**, Zod-validated, cannot override the risk engine.

## Key modules

| Path | Responsibility |
|---|---|
| `src/lib/blockchain/wagmi.ts` | wagmi/AppKit config, chain, ERC-20 + registry ABIs |
| `src/lib/signatures/paymentRequest.ts` | EIP-712 types, digest, recover, JSON codec |
| `src/lib/risk-engine/engine.ts` | deterministic ruleset, versioned findings |
| `src/features/verification/useVerification.ts` | orchestrates sig recovery + chain reads + risk |
| `src/features/payments/NewPaymentFlow.tsx` | compose → verify → review → transfer → receipt |
| `contracts/src/PayGuardRegistry.sol` | minimal recipient registry |
| `src/app/api/assistant/route.ts` | Gemini proxy (key stays server-side) |
