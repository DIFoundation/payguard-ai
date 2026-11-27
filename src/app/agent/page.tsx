import { AgentClient } from "@/features/agent/AgentClient";

export const metadata = { title: "Agent Mode — PayGuard AI" };

export default function AgentPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Agent mode</h1>
        <p className="mt-1 text-sm text-slate-400">
          Let an AI agent pay invoices for you, inside limits the blockchain enforces. It can only pay requests the
          recipient signed, up to the caps you set, until the permission expires or you revoke it.
        </p>
      </div>
      <AgentClient />
    </div>
  );
}
