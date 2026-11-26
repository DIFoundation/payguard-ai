"use client";

import { AlertTriangle, CheckCircle2, Info, ShieldAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RiskAssessment, RiskRecommendation, RiskSeverity } from "@/types";
import { cn } from "@/lib/utils";

const SEVERITY_STYLE: Record<RiskSeverity, { icon: React.ReactNode; badge: "info" | "verified" | "caution" | "danger"; label: string }> = {
  info: { icon: <Info className="h-4 w-4" />, badge: "info", label: "INFO" },
  low: { icon: <CheckCircle2 className="h-4 w-4" />, badge: "info", label: "LOW" },
  medium: { icon: <AlertTriangle className="h-4 w-4" />, badge: "caution", label: "MEDIUM" },
  high: { icon: <ShieldAlert className="h-4 w-4" />, badge: "danger", label: "HIGH" },
  critical: { icon: <XCircle className="h-4 w-4" />, badge: "danger", label: "CRITICAL" },
};

const RECOMMENDATION_STYLE: Record<RiskRecommendation, { label: string; className: string }> = {
  PROCEED: { label: "PROCEED", className: "text-verified-400 border-verified-500/40 bg-verified-500/10" },
  PROCEED_WITH_CAUTION: { label: "PROCEED WITH CAUTION", className: "text-caution-400 border-caution-500/40 bg-caution-500/10" },
  REVIEW_REQUIRED: { label: "REVIEW REQUIRED", className: "text-caution-400 border-caution-500/40 bg-caution-500/10" },
  DO_NOT_PROCEED: { label: "DO NOT PROCEED", className: "text-danger-400 border-danger-500/40 bg-danger-500/10" },
};

export function RiskReport({ assessment }: { assessment: RiskAssessment }) {
  const rec = RECOMMENDATION_STYLE[assessment.recommendation];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Risk Assessment</CardTitle>
          <span className={cn("rounded-lg border px-3 py-1 text-sm font-semibold", rec.className)}>
            {rec.label}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          Deterministic ruleset v{assessment.version} · evaluated{" "}
          {new Date(assessment.evaluatedAt).toLocaleTimeString()}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {assessment.findings.length === 0 && (
          <p className="text-sm text-slate-400">No findings. All checks passed.</p>
        )}
        {assessment.findings.map((f) => {
          const style = SEVERITY_STYLE[f.severity];
          return (
            <div
              key={f.code}
              className="rounded-lg border border-slate-800 bg-navy-950/50 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">{style.icon}</span>
                  <span className="text-sm font-medium text-slate-200">{f.title}</span>
                </div>
                <Badge variant={style.badge}>{style.label}</Badge>
              </div>
              <p className="mt-1.5 text-sm text-slate-400">{f.explanation}</p>
              <p className="mt-1 text-xs text-slate-500">
                <span className="font-medium text-slate-400">Source:</span> {f.evidence} ·{" "}
                <span className="font-medium text-slate-400">Action:</span> {f.action}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
