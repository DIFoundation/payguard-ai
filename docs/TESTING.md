# Testing

## Commands

```bash
pnpm test          # Vitest unit tests (risk engine + EIP-712 signatures)
pnpm typecheck     # tsc --noEmit
pnpm lint          # ESLint (Next 16 / react-hooks rules)
pnpm build         # production build incl. prerender checks
cd contracts && forge test   # Foundry contract tests
```

## Coverage

### Smart contract (`contracts/test/PayGuardRegistry.t.sol` — 7 tests)

- register / duplicate registration reverts / revoke / revoke-without-registration reverts
- cannot register another wallet / zero profile hash reverts / re-register after revoke
- `RecipientRegistered` / `RecipientRegistrationRevoked` events

### Risk engine (`src/lib/risk-engine/engine.test.ts` — 13 tests)

- clean payment → PROCEED_WITH_CAUTION; zero address → critical DO_NOT_PROCEED
- invalid/missing amount, wrong chain (critical, unoverridable)
- invalid signature + signer mismatch (critical even when registered)
- expired request (high), payer mismatch (critical), details mismatch (critical)
- unregistered recipient → low (explicitly not malicious), contract destination → medium
- insufficient balance → high, missing registry info → info not negative

### EIP-712 (`src/lib/signatures/paymentRequest.test.ts` — 8 tests)

- sign → recover round-trip; digest changes on amount/recipient/chain/token tampering
- different signer recovery; encode/decode round-trip; malformed input rejection

## E2E workflow (manual / demo)

1. Recipient connects wallet → *Create Request* → signs → copies JSON.
2. Payer connects wallet (QDay Aevum) → *New Payment* → paste JSON.
3. Verify panel shows `VERIFIED_PAYMENT_REQUEST` (or `REGISTERED_RECIPIENT` if registry set);
   risk report shows findings; review → authorize → wait for receipt → explorer link.
4. **Negative tests:** edit the JSON amount/recipient/token/chainId or let it expire →
   verification must fail and risk must recommend `DO_NOT_PROCEED`.

Playwright e2e is planned but not yet implemented; wallet interactions require a browser wallet
provider, so the deterministic layers (risk engine, signature codec) are covered by unit tests.
