"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import type { BuyInRequest as BuyInRequestData } from "@/lib/types";
import { BuyInRequest } from "./BuyInRequest";

interface HostRequestsPanelProps {
  requests: BuyInRequestData[];
  onResolve: (requestId: string, approve: boolean) => void;
}

export function HostRequestsPanel({ requests, onResolve }: HostRequestsPanelProps) {
  const pending = requests.filter((r) => r.status === "pending");
  const [dismissedFloating, setDismissedFloating] = useState<Set<string>>(new Set());

  // Auto-surface the newest pending request as a floating card, independent
  // of the bell popover — the popover stays for browsing/queueing when
  // several requests are pending at once.
  const newest = pending.filter((r) => !dismissedFloating.has(r.id)).at(-1);

  const resolve = (id: string, approve: boolean) => {
    setDismissedFloating((prev) => new Set(prev).add(id));
    onResolve(id, approve);
  };

  return (
    <>
      {newest && (
        <div className="absolute right-4 top-16 z-50 sm:right-6">
          <BuyInRequest
            playerName={newest.playerDisplayName}
            amount={newest.amount}
            type={newest.type}
            deferred={newest.deferredToNextHand}
            onApprove={() => resolve(newest.id, true)}
            onReject={() => resolve(newest.id, false)}
          />
        </div>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            data-testid="host-requests-trigger"
            className="relative text-[var(--text-secondary)] hover:bg-white/8 hover:text-[var(--text-primary)]"
          >
            <Bell className="h-4 w-4" />
            {pending.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white">
                {pending.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 border-white/10 bg-black/80 p-2 backdrop-blur-xl">
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Buy-in requests
          </p>
          {pending.length === 0 ? (
            <p className="px-2 py-3 text-sm text-[var(--text-secondary)]">No pending requests.</p>
          ) : (
            <div className="flex flex-col gap-2 p-1">
              {pending.map((req) => (
                <div key={req.id} data-testid="buyin-request-row">
                  <BuyInRequest
                    playerName={req.playerDisplayName}
                    amount={req.amount}
                    type={req.type}
                    deferred={req.deferredToNextHand}
                    onApprove={() => resolve(req.id, true)}
                    onReject={() => resolve(req.id, false)}
                    className="w-full animate-none"
                  />
                </div>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}
