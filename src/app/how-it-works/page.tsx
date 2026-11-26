import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BadgeCheck, FileSignature, ListChecks, Radar, Wallet } from "lucide-react";

export const metadata = { title: "How it works — PayGuard AI" };

const ITEMS = [
  {
    icon: <FileSignature className="h-5 w-5" />,
    title: "1. Recipient creates a signed request",
    body: "The payee fills in recipient, optional intended payer, chain, token, amount (base units), reference, purpose, expiry, and a random nonce — then signs the EIP-712 typed data with their wallet. The result is a portable JSON payload.",
  },
  {
    icon: <BadgeCheck className="h-5 w-5" />,
    title: "2. Signature verification",
    body: "PayGuard recovers the signer from the EIP-712 digest and confirms it matches the stated recipient. The chain ID, token, and expiry are checked against the active network and current time.",
  },
  {
    icon: <Radar className="h-5 w-5" />,
    title: "3. Deterministic risk assessment",
    body: "A versioned rules engine evaluates invalid addresses, zero address, wrong chain/token, expired requests, signer and payer mismatches, detail mismatches, registry status, contract destinations, and balance sufficiency. Every finding includes an explanation, evidence source, and recommended action.",
  },
  {
    icon: <ListChecks className="h-5 w-5" />,
    title: "4. Human review & authorization",
    body: "The payer reviews sender, recipient, amount, token, purpose, expiry, verification status, and the full risk report. Only then can they authorize a standard ERC-20 transfer from their own wallet.",
  },
  {
    icon: <Wallet className="h-5 w-5" />,
    title: "5. Settlement & receipt",
    body: "The transaction is broadcast to QDay Aevum, monitored until a receipt arrives, and linked to the block explorer. PayGuard never marks a payment complete from a hash alone — it waits for confirmation.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-white">How PayGuard works</h1>
        <p className="mt-2 text-slate-400">
          Confirmation of Payee for stablecoin payments — cryptographic, deterministic, and
          human-authorized.
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {ITEMS.map((item) => (
          <Card key={item.title}>
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600/15 text-primary-400">
                {item.icon}
              </span>
              <CardTitle className="text-base">{item.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-400">{item.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-5 text-sm text-slate-400">
          <strong className="text-slate-200">Important limitations.</strong> A valid signature proves
          the signer controls the wallet and agreed to the payment details at signing time — it does
          not prove legal identity, legitimacy, or that off-chain obligations will be honored.
          PayGuardRegistry registration is opt-in wallet control evidence only. Always verify
          recipients through a trusted channel for high-value payments.
        </CardContent>
      </Card>
    </div>
  );
}
