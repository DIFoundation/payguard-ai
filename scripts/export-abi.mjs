// Regenerates src/lib/blockchain/settlementAbi.ts from the forge build output.
import { readFileSync, writeFileSync } from "node:fs";

const art = JSON.parse(
  readFileSync("contracts/out/PayGuardSettlement.sol/PayGuardSettlement.json", "utf8"),
);
const abi = art.abi.filter((e) => ["function", "event", "error"].includes(e.type));
writeFileSync(
  "src/lib/blockchain/settlementAbi.ts",
  "// AUTO-GENERATED from contracts/out/PayGuardSettlement.sol (forge build). Do not edit by hand.\n" +
    "// Regenerate: cd contracts && forge build && cd .. && node scripts/export-abi.mjs\n" +
    `export const settlementAbi = ${JSON.stringify(abi, null, 2)} as const;\n`,
);
console.log(`wrote ${abi.length} ABI entries`);
