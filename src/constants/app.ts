export const APP_NAME = "PayGuard AI";
export const APP_TAGLINE = "Verify Before You Pay.";
export const APP_DESCRIPTION =
  "AI-powered Confirmation of Payee for stablecoin payments on QDay Aevum.";

export const QDAY = {
  chainId: 44005,
  chainIdHex: "0xABE5",
  name: "QDay Aevum Testnet",
  rpcUrl: process.env.NEXT_PUBLIC_QDAY_RPC_URL ?? "https://rpc-test.qday.info",
  wsUrl: process.env.NEXT_PUBLIC_QDAY_WS_URL ?? "wss://rpc-test.qday.info",
  explorerUrl:
    process.env.NEXT_PUBLIC_QDAY_EXPLORER_URL ?? "https://explorer-test.qday.info",
} as const;

export const TUSD8 = {
  address:
    (process.env.NEXT_PUBLIC_TUSD8_ADDRESS as `0x${string}` | undefined) ??
    "0x456569838f1d43009A91ebA4263147Afd7233483",
  symbol: "tUSD8",
  name: "Test USD 8",
  decimals: 6,
} as const;

export const REGISTRY_ADDRESS = (process.env
  .NEXT_PUBLIC_PAYGUARD_REGISTRY ?? "") as `0x${string}` | "";

/** PayGuardSettlement: verifies recipient-signed requests on-chain and settles them. */
export const SETTLEMENT_ADDRESS = (process.env
  .NEXT_PUBLIC_PAYGUARD_SETTLEMENT ?? "") as `0x${string}` | "";

/** First block to scan for PayGuard events (the deployment block of PayGuardSettlement). */
export const SETTLEMENT_DEPLOY_BLOCK = BigInt(
  process.env.NEXT_PUBLIC_PAYGUARD_DEPLOY_BLOCK ?? "4245204",
);

export function explorerTxUrl(hash: string): string {
  return `${QDAY.explorerUrl}/tx/${hash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${QDAY.explorerUrl}/address/${address}`;
}
