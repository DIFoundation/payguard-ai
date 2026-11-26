"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { ConnectButton } from "@/features/wallet/ConnectButton";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/new-payment", label: "New Payment" },
  { href: "/verify", label: "Verify" },
  { href: "/request", label: "Create Request" },
  { href: "/assistant", label: "Assistant" },
  { href: "/history", label: "History" },
  { href: "/register", label: "Register" },
];

const PUBLIC_NAV = [
  { href: "/", label: "Home" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/docs", label: "Docs" },
  { href: "/about", label: "About" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/how-it-works") ||
    pathname.startsWith("/about") ||
    pathname.startsWith("/docs");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-navy-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600/20 text-primary-400">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <span className="text-base font-semibold tracking-tight text-white">
              PayGuard <span className="text-primary-400">AI</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {(isPublic ? PUBLIC_NAV : NAV).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  pathname === item.href
                    ? "bg-slate-800 text-white"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ConnectButton size="sm" />
          </div>
        </div>
        {/* Mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-800/60 px-4 py-2 md:hidden">
          {(isPublic ? PUBLIC_NAV : NAV).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-1 text-xs",
                pathname === item.href
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:text-slate-200",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="border-t border-slate-800/60 py-6 text-center text-xs text-slate-600">
        PayGuard AI — Verify Before You Pay · QDay Aevum Testnet · Not financial advice
      </footer>
    </div>
  );
}
