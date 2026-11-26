import { VerifyClient } from "@/features/verification/VerifyClient";

export const metadata = { title: "Verify Recipient — PayGuard AI" };

export default function VerifyPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Recipient verification</h1>
        <p className="mt-1 text-sm text-slate-400">
          Check a wallet address or signed payment request before sending funds.
        </p>
      </div>
      <VerifyClient />
    </div>
  );
}
