import { AIAssistant } from "@/features/assistant/AIAssistant";

export const metadata = { title: "AI Assistant — PayGuard AI" };

export default function AssistantPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">AI assistant</h1>
        <p className="mt-1 text-sm text-slate-400">
          Prepare payment drafts and explanations. The assistant cannot sign or send transactions.
        </p>
      </div>
      <AIAssistant />
    </div>
  );
}
