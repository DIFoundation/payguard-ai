# Deployment

## Frontend (Vercel)

```bash
pnpm install
pnpm build
vercel deploy        # or connect the GitHub repo in the Vercel dashboard
```

Required env vars (see `.env.example`):

| Var | Notes |
|---|---|
| `NEXT_PUBLIC_APP_URL` | production URL |
| `NEXT_PUBLIC_QDAY_*` | chain 44005 RPC/WS/explorer (defaults provided) |
| `NEXT_PUBLIC_TUSD8_ADDRESS` | defaults to the verified tUSD8 address |
| `NEXT_PUBLIC_PAYGUARD_REGISTRY` | deployed registry address (optional but recommended) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | **required** for wallet connect (Reown dashboard) |
| `GEMINI_API_KEY` | server-only; enables `/api/assistant` |
| `AI_MODEL` | optional, default `gemini-2.0-flash` |

## Registry contract (QDay Aevum)

```bash
cd contracts
forge build

# Deploy (requires a funded deployer key on chain 44005)
PRIVATE_KEY=0x... forge script script/DeployPayGuardRegistry.s.sol \
  --rpc-url https://rpc-test.qday.info --broadcast --verify \
  --etherscan-api-key <explorer-api-key-if-supported>
```

Then set `NEXT_PUBLIC_PAYGUARD_REGISTRY=<address>` in `.env.local` / Vercel env and redeploy.

If the explorer supports Sourcify/Etherscan-style verification, verify the source there; the
contract is intentionally small and self-contained.

## Local development

```bash
pnpm install
cp .env.example .env.local   # fill in WalletConnect project id at minimum
pnpm dev                     # http://localhost:3000
```

## Health checklist before demo

- [ ] `pnpm build` passes; all routes prerender.
- [ ] Wallet connects and switches to chain 44005.
- [ ] tUSD8 + tQDAY balances render on dashboard.
- [ ] A signed request verifies; a tampered one fails.
- [ ] Registry address configured (or UI shows honest "not configured" state).
- [ ] `GEMINI_API_KEY` set if demoing the assistant.
