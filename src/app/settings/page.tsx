"use client";

import { setPreferences, usePreferences } from "@/lib/storage/local";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QDAY, TUSD8, REGISTRY_ADDRESS } from "@/constants/app";

export default function SettingsPage() {
  const prefs = usePreferences();
  const theme = prefs.theme;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">Local preferences and network configuration.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Network</CardTitle>
          <CardDescription>Payments settle on this chain only.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <Row k="Network" v={QDAY.name} />
          <Row k="Chain ID" v={String(QDAY.chainId)} mono />
          <Row k="RPC" v={QDAY.rpcUrl} mono />
          <Row k="Explorer" v={QDAY.explorerUrl} mono />
          <Row k="Native token" v="tQDAY (18 decimals)" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Token</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <Row k="Symbol" v={TUSD8.symbol} />
          <Row k="Contract" v={TUSD8.address} mono />
          <Row k="Decimals" v={String(TUSD8.decimals)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registry</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <Row
            k="PayGuardRegistry"
            v={REGISTRY_ADDRESS || "Not configured (NEXT_PUBLIC_PAYGUARD_REGISTRY)"}
            mono
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Button
            variant={theme === "dark" ? "default" : "secondary"}
            size="sm"
            onClick={() => setPreferences({ theme: "dark" })}
          >
            Dark
          </Button>
          <Button
            variant={theme === "light" ? "default" : "secondary"}
            size="sm"
            disabled
            title="Light theme is not yet supported"
          >
            Light
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Privacy</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-400">
          <p>
            PayGuard stores only non-sensitive local data (drafts, saved recipients, payment
            history) in your browser. No private keys, seed phrases, or credentials are ever stored
            or transmitted. Local data is never treated as verification evidence — critical checks
            always re-run against the chain.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800/60 py-1.5 last:border-0">
      <span className="text-slate-500">{k}</span>
      <span className={mono ? "font-mono text-xs text-slate-200" : "text-slate-200"}>{v}</span>
    </div>
  );
}
