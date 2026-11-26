# Technical Research Notes

## QDay Aevum Testnet (verified 2026-11-25)

- Chain ID: `44005` (`0xABE5`) — confirmed via `eth_chainId` against `https://rpc-test.qday.info`.
- tUSD8 `0x456569838f1d43009A91ebA4263147Afd7233483` — `symbol()` returns `tUSD8`,
  `decimals()` = 6. Standard ERC-20 `transfer`/`balanceOf` interface.
- Explorer: `https://explorer-test.qday.info`.

## EIP-712 payment requests

- Domain: `{ name: "PayGuard", version: "1", chainId }` — no `verifyingContract` so requests are
  not bound to a deployment; chain ID still prevents cross-chain replay.
- `PaymentRequest` fields are all value types (`address`, `uint256`, `string`, `bytes32`),
  hashed per EIP-712; `eth_signTypedData_v4` in wallets, `recoverTypedDataAddress` in viem.
- `nonce` is a random bytes32 per request → replay resistance; `expiresAt` bounds validity.
- Strings (`reference`, `purpose`) are part of the signed payload — free-form but tamper-evident.

## Why a registry contract

On-chain registration gives payers a cheap, trust-minimized "opted-in recipient" signal that the
recipient controls the wallet (they paid gas to register). It deliberately stores no PII.

## Why direct ERC-20 transfer (no router)

- Simplest possible settlement path; the user sees exactly one `transfer(to, amount)` in their
  wallet prompt.
- No approvals, no allowances, no custom contract risk.
- tUSD8 is a plain ERC-20; a router adds attack surface without benefit.

## AI integration choice

- Gemini via a single Next.js route handler; `responseMimeType: application/json` + Zod validation
  on both request and response.
- Model: `AI_MODEL` env (default `gemini-2.0-flash`).
- The endpoint has no signing/payment capability — it only returns draft fields.

## Optional integrations (investigated, deferred)

- **ERC-8004 / ERC-4337 / x402:** not integrated. No verified Aevum deployments/configs were
  confirmed during the build window; per project rules they remain stretch goals and were not
  fabricated.

## Notable implementation details

- wagmi v3 + `@reown/appkit-adapter-wagmi` v2; `wagmiConfig = wagmiAdapter.wagmiConfig` +
  `QueryClientProvider` (wagmi v3 requires react-query).
- Next.js 16 Cache Components: `Date.now()`/`crypto.getRandomValues()` are disallowed during
  prerender — client-only values are sourced via mount-time effects.
- Amounts are always `uint256` base-unit strings / `bigint`; display uses `formatUnits`.
