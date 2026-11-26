import { RegisterCard } from "@/features/recipients/RegisterCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Recipient Registration — PayGuard AI" };

export default function RegisterPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Recipient registration</h1>
        <p className="mt-1 text-sm text-slate-400">
          Register your wallet on the PayGuardRegistry contract so payers see an on-chain opt-in signal.
        </p>
      </div>
      <RegisterCard />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What registration does — and does not — mean</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-slate-400">
          <p>· It records that this wallet owner opted in to PayGuard recipient status.</p>
          <p>· It stores only a profile hash — never documents or personal data.</p>
          <p>· It is <strong className="text-slate-200">not</strong> legal identity verification and proves nothing about legitimacy.</p>
          <p>· Unregistered wallets are not labeled malicious — registration is optional.</p>
        </CardContent>
      </Card>
    </div>
  );
}
