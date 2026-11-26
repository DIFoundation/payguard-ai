"use client";

import { useAppKit } from "@reown/appkit/react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePayGuardWallet } from "@/hooks/usePayGuardWallet";

function shorten(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectButton({ size }: { size?: "sm" | "default" | "lg" | "icon" }) {
  const { open } = useAppKit();
  const { isConnected, address } = useAccount();
  const { onCorrectChain } = usePayGuardWallet();

  if (!isConnected || !address) {
    return (
      <Button onClick={() => open()} size={size ?? "default"}>
        Connect Wallet
      </Button>
    );
  }

  return (
    <Button
      variant="secondary"
      size={size ?? "default"}
      onClick={() => open()}
      className="gap-2"
    >
      <span className="font-mono text-xs">{shorten(address)}</span>
      {!onCorrectChain && (
        <Badge variant="caution" className="text-[10px]">
          Wrong network
        </Badge>
      )}
    </Button>
  );
}
