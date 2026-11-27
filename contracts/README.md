# PayGuard contracts

| Contract | Purpose |
|---|---|
| `PayGuardRegistry` | Wallets self-register as PayGuard recipients (profile hash only, no PII). |
| `PayGuardSettlement` | Settles a payment **only** against a request the recipient signed (EIP-712). Any altered field reverts. Optional agent policies: token, per-tx cap, rolling 24h cap, expiry, registered-only, instant revoke. Never holds funds, no admin. |

## Setup

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0   # tested version
forge install foundry-rs/forge-std                          # if lib/forge-std is missing
forge build
forge test -vv
```

`remappings.txt` and `foundry.toml` (solc 0.8.28, EVM `paris`) are already configured.

## Deploy (Aevum testnet)

```bash
export PRIVATE_KEY=0x...   # throwaway testnet key
forge script script/DeployPayGuard.s.sol --rpc-url https://rpc-test.qday.info --broadcast
```

Put the printed addresses in `.env.local` as `NEXT_PUBLIC_PAYGUARD_REGISTRY` and
`NEXT_PUBLIC_PAYGUARD_SETTLEMENT`, then refresh the frontend ABI:

```bash
forge build && cd .. && node scripts/export-abi.mjs
```

## Signed-message compatibility

`PayGuardSettlement` and `src/lib/signatures/paymentRequest.ts` must agree on the EIP-712
domain (`PayGuard`, `1`, chainId, verifyingContract) and the `PaymentRequest` type string.
`test_DigestMatchesFrontendVector` (Foundry) and "matches the Solidity vector" (Vitest) pin both
to one digest. If you edit either side, both tests will fail until they match again.
