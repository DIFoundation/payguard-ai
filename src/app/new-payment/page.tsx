import { NewPaymentFlow } from "@/features/payments/NewPaymentFlow";

export const metadata = { title: "New Payment — PayGuard AI" };

export default function NewPaymentPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">New payment</h1>
        <p className="mt-1 text-sm text-slate-400">
          Verify the recipient, review the risk report, then authorize the tUSD8 transfer in your wallet.
        </p>
      </div>
      <NewPaymentFlow />
    </div>
  );
}
