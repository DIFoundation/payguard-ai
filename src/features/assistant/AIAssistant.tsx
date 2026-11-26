"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { z } from "zod";

const outputSchema = z.object({
  intent: z.string(),
  recipient: z.string().nullable(),
  amount: z.string().nullable(),
  token: z.string().nullable(),
  purpose: z.string().nullable(),
  reference: z.string().nullable(),
  expiresInHours: z.number().nullable(),
  missingFields: z.array(z.string()),
  questions: z.array(z.string()),
  explanation: z.string(),
});

type AssistantOutput = z.infer<typeof outputSchema>;

const EXAMPLES = [
  "Prepare a payment of 25 tUSD8 to 0x456569838f1d43009A91ebA4263147Afd7233483 for a design invoice.",
  "Verify this recipient before I pay: 0x456569838f1d43009A91ebA4263147Afd7233483",
  "Explain why a payment request failed verification.",
];

export function AIAssistant() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<AssistantOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (text?: string) => {
    const p = (text ?? prompt).trim();
    if (!p || loading) return;
    setLoading(true);
    setError(null);
    setOutput(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: p }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Assistant request failed.");
        return;
      }
      const parsed = outputSchema.safeParse(data);
      if (!parsed.success) {
        setError("Assistant returned an unexpected response shape.");
        return;
      }
      setOutput(parsed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  const useAsDraft = () => {
    if (!output) return;
    const params = new URLSearchParams();
    if (output.recipient) params.set("recipient", output.recipient);
    if (output.amount) params.set("amount", output.amount);
    if (output.purpose) params.set("purpose", output.purpose);
    if (output.reference) params.set("reference", output.reference);
    router.push(`/new-payment?${params.toString()}`);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-accent-400" /> PayGuard Assistant
          </CardTitle>
          <CardDescription>
            Draft payments and get explanations. The assistant never signs or sends transactions —
            every payment still requires your explicit wallet authorization.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder='e.g. "Prepare a payment of 25 tUSD8 to 0x… for a design invoice."'
            className="min-h-28"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="flex items-center gap-2">
            <Button onClick={() => submit()} disabled={!prompt.trim() || loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {loading ? "Thinking…" : "Ask"}
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs text-slate-500">Try an example:</p>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setPrompt(ex);
                  submit(ex);
                }}
                className="rounded-lg border border-slate-800 bg-navy-950/50 p-2.5 text-left text-xs text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200"
              >
                {ex}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 lg:col-span-2">
        {error && (
          <Card>
            <CardContent className="p-4 text-sm text-danger-400">{error}</CardContent>
          </Card>
        )}
        {output && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Draft result</CardTitle>
                <Badge variant="accent">
                  <Sparkles className="h-3 w-3" /> {output.intent.replace("_", " ")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p className="text-slate-300">{output.explanation}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {output.recipient && <><dt className="text-slate-500">Recipient</dt><dd className="truncate font-mono text-slate-200">{output.recipient}</dd></>}
                {output.amount && <><dt className="text-slate-500">Amount</dt><dd className="text-slate-200">{output.amount} {output.token ?? "tUSD8"}</dd></>}
                {output.purpose && <><dt className="text-slate-500">Purpose</dt><dd className="text-slate-200">{output.purpose}</dd></>}
                {output.reference && <><dt className="text-slate-500">Reference</dt><dd className="text-slate-200">{output.reference}</dd></>}
              </dl>
              {output.missingFields.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-caution-400">Missing information</p>
                  <ul className="list-inside list-disc text-xs text-slate-400">
                    {output.missingFields.map((f) => <li key={f}>{f}</li>)}
                  </ul>
                </div>
              )}
              {output.questions.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-primary-300">Questions</p>
                  <ul className="list-inside list-disc text-xs text-slate-400">
                    {output.questions.map((q) => <li key={q}>{q}</li>)}
                  </ul>
                </div>
              )}
              {output.intent === "prepare_payment" && output.recipient && output.amount && (
                <Button size="sm" variant="secondary" onClick={useAsDraft}>
                  Open as payment draft
                </Button>
              )}
              <p className="text-[11px] text-slate-600">
                AI output is a draft suggestion only. It cannot sign, send, or verify payments.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
