import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-slate-700 bg-slate-800 text-slate-300",
        verified: "border-verified-500/40 bg-verified-500/10 text-verified-400",
        caution: "border-caution-500/40 bg-caution-500/10 text-caution-400",
        danger: "border-danger-500/40 bg-danger-500/10 text-danger-400",
        info: "border-primary-500/40 bg-primary-500/10 text-primary-300",
        accent: "border-accent-500/40 bg-accent-500/10 text-accent-400",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
