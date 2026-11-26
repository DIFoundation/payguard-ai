import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  FileSignature,
  Radar,
  ScanSearch,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { APP_TAGLINE, QDAY, TUSD8 } from "@/constants/app";

const STEPS = [
  {
    icon: <FileSignature className="h-5 w-5" />,
    title: "Recipient signs a request",
    body: "The payee creates an EIP-712 signed payment request binding wallet, amount, token, chain, expiry, and nonce.",
  },
  {
    icon: <ScanSearch className="h-5 w-5" />,
    title: "Payer imports & verifies",
    body: "PayGuard recovers the signer, checks the chain, registry status, contract code, and every protected field.",
  },
  {
    icon: <Radar className="h-5 w-5" />,
    title: "Risk engine explains",
    body: "A deterministic ruleset produces an explainable risk report — no black-box AI deciding for you.",
  },
  {
    icon: <Wallet className="h-5 w-5" />,
    title: "You authorize the transfer",
    body: "A direct tUSD8 ERC-20 transfer settles on QDay Aevum. PayGuard never holds keys or funds.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden py-20 sm:py-28">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.12),transparent_60%)]" />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary-500/30 bg-primary-500/10 px-4 py-1.5 text-xs text-primary-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Confirmation of Payee for stablecoins
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
            {APP_TAGLINE}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-400">
            PayGuard AI protects stablecoin payments on {QDAY.name}. Cryptographically verify the
            recipient, prove the payment request is untampered, understand the risks — then pay
            {" "}{TUSD8.symbol} with confidence.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/dashboard">
              <Button size="lg">Open dashboard <ArrowRight className="h-4 w-4" /></Button>
            </Link>
            <Link href="/how-it-works">
              <Button size="lg" variant="secondary">How it works</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Card key={s.title} className="border-slate-800 bg-navy-900/60">
              <CardContent className="flex flex-col gap-3 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600/15 text-primary-400">
                  {s.icon}
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">Step {i + 1}</p>
                  <h3 className="mt-0.5 font-semibold text-slate-100">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-400">{s.body}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Differentiator */}
      <section className="border-y border-slate-800/60 bg-navy-900/40 py-16">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-verified-400">
              <BadgeCheck className="h-4 w-4" /> The core innovation
            </div>
            <h2 className="text-3xl font-bold text-white">Verified Payment Requests</h2>
            <p className="mt-4 text-slate-400">
              Recipients sign payment requests with EIP-712 typed data. The signature binds the
              wallet, amount, token, chain, reference, purpose, expiry, and a unique nonce. If
              anyone changes a single protected field — recipient, amount, token, or chain —
              verification fails immediately.
            </p>
            <p className="mt-3 text-slate-400">
              The payer independently verifies everything before authorizing. No trusted middleman.
              No fabricated safety scores.
            </p>
          </div>
          <Card className="border-slate-700">
            <CardContent className="p-6 font-mono text-xs leading-6 text-slate-300">
              <p className="text-slate-500">{"// tamper-evident by construction"}</p>
              <p><span className="text-accent-400">PaymentRequest</span>({'{'})</p>
              <p className="pl-4">recipient: <span className="text-primary-300">&quot;0x…&quot;</span>,</p>
              <p className="pl-4">amount: <span className="text-primary-300">50000000</span>, <span className="text-slate-500">{"// 50 tUSD8"}</span></p>
              <p className="pl-4">token: <span className="text-primary-300">&quot;0x4565…3483&quot;</span>,</p>
              <p className="pl-4">expiresAt: <span className="text-primary-300">1764…</span>,</p>
              <p className="pl-4">nonce: <span className="text-primary-300">&quot;0x9f…&quot;</span>,</p>
              <p>{'}'} <span className="text-slate-500">{"// + EIP-712 signature"}</span></p>
              <p className="mt-3 text-verified-400">✓ any field change → signature invalid</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-3xl font-bold text-white">See it in action</h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-400">
          A merchant signs a request. A customer verifies it, reviews the risk report, and settles
          {" "}{TUSD8.symbol} on {QDAY.name}. Then try the tampered version — PayGuard catches it.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/request"><Button size="lg" variant="secondary">Create a request</Button></Link>
          <Link href="/verify"><Button size="lg" variant="secondary">Verify a recipient</Button></Link>
        </div>
      </section>
    </div>
  );
}
