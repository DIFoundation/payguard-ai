import { RequestCreator } from "@/features/payments/RequestCreator";

export const metadata = { title: "Create Payment Request — PayGuard AI" };

export default function RequestPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Create payment request</h1>
        <p className="mt-1 text-sm text-slate-400">
          As a recipient, sign a payment request your payer can independently verify.
        </p>
      </div>
      <RequestCreator />
    </div>
  );
}
