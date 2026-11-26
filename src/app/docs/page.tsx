import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QDAY, TUSD8, REGISTRY_ADDRESS } from "@/constants/app";

export const metadata = { title: "Documentation — PayGuard AI" };

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Quick start",
    body: (
      <ol className="list-decimal space-y-1 pl-5">
        <li>Copy <code>.env.example</code> to <code>.env.local</code> and fill in values.</li>
        <li><code>pnpm install && pnpm dev</code> — open http://localhost:3000.</li>
        <li>Connect a wallet on {QDAY.name}, get testnet tQDAY for gas, and tUSD8 for payments.</li>
        <li>As a recipient: open <strong>Create Request</strong>, sign a payment request, share the JSON.</li>
        <li>As a payer: open <strong>New Payment</strong>, paste the JSON, review verification + risk, authorize the transfer.</li>
      </ol>
    ),
  },
  {
    title: "Network & contracts",
    body: (
      <ul className="space-y-1">
        <li>Chain: {QDAY.name} (ID {QDAY.chainId}) — RPC {QDAY.rpcUrl}</li>
        <li>Explorer: {QDAY.explorerUrl}</li>
        <li>Payment token: {TUSD8.symbol} at <code>{TUSD8.address}</code> ({TUSD8.decimals} decimals)</li>
        <li>Registry: {REGISTRY_ADDRESS || "not configured — see .env.example"}</li>
      </ul>
    ),
  },
  {
    title: "Verified payment requests (EIP-712)",
    body: (
      <p>
        Domain: <code>PayGuard / 1 / chainId</code>. Type <code>PaymentRequest</code> binds{" "}
        <code>recipient, payer, chainId, token, amount, reference, purpose, expiresAt, nonce</code>.
        Amounts are uint256 base units. The signature is produced by the recipient&apos;s wallet via{" "}
        <code>eth_signTypedData_v4</code> and verified by recovering the signer — no server involved.
      </p>
    ),
  },
  {
    title: "Risk engine",
    body: (
      <p>
        Deterministic ruleset (see <code>src/lib/risk-engine/engine.ts</code>, versioned). Findings have
        a code, severity (info → critical), explanation, evidence source, and recommended action.
        Critical signature/chain/detail mismatches force <code>DO_NOT_PROCEED</code> and cannot be
        overridden by positive signals. Missing information is reported as unknown, never as negative
        evidence.
      </p>
    ),
  },
  {
    title: "AI assistant",
    body: (
      <p>
        <code>POST /api/assistant</code> proxies prompts to Google Gemini server-side (key never
        exposed). Output is Zod-validated and limited to draft preparation and explanations — it
        cannot sign, send, or override risk findings.
      </p>
    ),
  },
  {
    title: "Security notes",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>All amounts use integer base units; no floating-point math.</li>
        <li>Payments are plain ERC-20 <code>transfer</code> calls signed by the user&apos;s wallet.</li>
        <li>No private keys, seeds, or credentials are stored; localStorage holds only non-sensitive drafts/history.</li>
        <li>The registry contract holds no funds and has no admin functions.</li>
        <li>This project is unaudited testnet software — do not use with real funds.</li>
      </ul>
    ),
  },
];

export default function DocsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Documentation</h1>
        <p className="mt-2 text-slate-400">
          Architecture, setup, and security notes for PayGuard AI.
        </p>
      </div>
      {SECTIONS.map((s) => (
        <Card key={s.title}>
          <CardHeader>
            <CardTitle className="text-lg">{s.title}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-slate-300">{s.body}</CardContent>
        </Card>
      ))}
    </div>
  );
}
