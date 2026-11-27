# Deployed contracts — QDay Aevum Testnet (chain 44005)

| Contract | Address | Deploy tx |
|---|---|---|
| PayGuardRegistry | `0x94766448920032f9Cb892e277731F77164512B66` | `0xfd75c1a875d0a20208114da346fa10be909fce56519cf8a8f5c5e7d0a4ba6927` |
| PayGuardSettlement | `0x76B28d8A0e95dBF90eDE0cB4C709e6dE30b761C0` | `0xe77858d10883c614a6f648d0a9cce0f83902d47838f0ea8de27e8a8855590df5` |
| tUSD8 (existing token) | `0x456569838f1d43009A91ebA4263147Afd7233483` | — |

Both deploy transactions landed in block 4245204. Explorer: https://explorer-test.qday.info

## Frontend configuration

```
NEXT_PUBLIC_PAYGUARD_REGISTRY=0x94766448920032f9Cb892e277731F77164512B66
NEXT_PUBLIC_PAYGUARD_SETTLEMENT=0x76B28d8A0e95dBF90eDE0cB4C709e6dE30b761C0
```

Requests signed before this deployment (or for another settlement address) are rejected by design:
the EIP-712 domain binds every signature to one chain and one contract.

## Source verification

Compiler 0.8.28, optimizer 200 runs, EVM `paris`. If the explorer exposes a Blockscout-style API:

```bash
cd contracts
forge verify-contract 0x76B28d8A0e95dBF90eDE0cB4C709e6dE30b761C0 \
  src/PayGuardSettlement.sol:PayGuardSettlement \
  --chain-id 44005 --compiler-version 0.8.28 --evm-version paris --num-of-optimizations 200 \
  --constructor-args $(cast abi-encode "constructor(address)" 0x94766448920032f9Cb892e277731F77164512B66) \
  --verifier blockscout --verifier-url https://explorer-test.qday.info/api/

forge verify-contract 0x94766448920032f9Cb892e277731F77164512B66 \
  src/PayGuardRegistry.sol:PayGuardRegistry \
  --chain-id 44005 --compiler-version 0.8.28 --evm-version paris --num-of-optimizations 200 \
  --verifier blockscout --verifier-url https://explorer-test.qday.info/api/
```

If that API is not available, use the explorer's "Verify & Publish" page with
`forge verify-contract ... --show-standard-json-input` output (standard JSON input).
Record the result here once verified.
