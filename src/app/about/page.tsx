import { Card, CardContent } from "@/components/ui/card";
import { APP_NAME, APP_TAGLINE } from "@/constants/app";

export const metadata = { title: "About — PayGuard AI" };

export default function AboutPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-white">About {APP_NAME}</h1>
        <p className="mt-2 text-lg text-primary-300">{APP_TAGLINE}</p>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3 p-6 text-sm leading-6 text-slate-300">
          <p>
            {APP_NAME} is an AI-assisted Confirmation of Payee application for stablecoin payments on
            the QDay Aevum network. It was built for the QDay Aevum Builder Challenge.
          </p>
          <p>
            The problem: stablecoin transfers are irreversible and pseudonymous. A single wrong
            address, altered invoice, or replayed payment request can move funds permanently. Banks
            solved this for fiat with Confirmation of Payee — PayGuard brings the same protection to
            on-chain stablecoin payments.
          </p>
          <p>
            The approach: recipients cryptographically sign payment requests (EIP-712), payers
            verify the signature and every protected field, a deterministic risk engine explains what
            was checked, and the human always authorizes the final transfer in their own wallet.
          </p>
          <p className="text-slate-500">
            PayGuard is a hackathon project. It is not audited, not a custodian, and not financial
            advice. Use it on testnet only.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
