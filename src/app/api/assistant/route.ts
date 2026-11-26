import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  context: z
    .object({
      recipient: z.string().optional(),
      amount: z.string().optional(),
      riskSummary: z.string().optional(),
    })
    .optional(),
});

const assistantOutputSchema = z.object({
  intent: z.enum(["prepare_payment", "verify_recipient", "explain_risk", "clarify", "general"]),
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

const SYSTEM_PROMPT = `You are PayGuard AI, a payment-verification assistant for stablecoin payments on the QDay Aevum testnet. You help users prepare payment drafts and understand verification results.

Rules:
- You NEVER sign transactions, execute transfers, approve allowances, or authorize payments. You only prepare drafts for human review.
- You NEVER claim a wallet is safe. You only report what evidence exists.
- Amounts must be expressed as decimal strings in tUSD8 (e.g. "50.00"), never floats in reasoning.
- If information is missing, list it in missingFields and ask a clarifying question in questions.
- If the user asks to explain risk findings, summarize them faithfully without adding new claims.
- intent values: "prepare_payment" when the user wants to create/pay something, "verify_recipient" when they want to check a wallet, "explain_risk" when asking about findings, "clarify" when you need more info, "general" otherwise.

Respond ONLY with JSON matching this shape:
{"intent": string, "recipient": string|null, "amount": string|null, "token": string|null, "purpose": string|null, "reference": string|null, "expiresInHours": number|null, "missingFields": string[], "questions": string[], "explanation": string}`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI assistant is not configured (missing GEMINI_API_KEY)." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const model = process.env.AI_MODEL ?? "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const userContent = parsed.data.context
    ? `${parsed.data.prompt}\n\nContext: ${JSON.stringify(parsed.data.context)}`
    : parsed.data.prompt;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userContent }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `AI provider error (${res.status})`, detail: detail.slice(0, 300) },
        { status: 502 },
      );
    }

    const data = await res.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return NextResponse.json({ error: "Empty response from AI provider." }, { status: 502 });
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "AI returned malformed JSON." }, { status: 502 });
    }

    const output = assistantOutputSchema.safeParse(json);
    if (!output.success) {
      return NextResponse.json({ error: "AI output failed validation." }, { status: 502 });
    }

    return NextResponse.json(output.data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI request failed." },
      { status: 500 },
    );
  }
}
