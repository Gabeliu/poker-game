"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { formatChips } from "@/lib/format";
import type { BuyInRequest } from "@/lib/types";

interface HostRequestsPanelProps {
  requests: BuyInRequest[];
  onResolve: (requestId: string, approve: boolean) => void;
}

export function HostRequestsPanel({ requests, onResolve }: HostRequestsPanelProps) {
  const pending = requests.filter((r) => r.status === "pending");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          data-testid="host-requests-trigger"
          className="relative border-white/15 bg-card/80"
        >
          <Bell className="h-4 w-4" />
          {pending.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
              {pending.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Buy-in requests
        </p>
        {pending.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">No pending requests.</p>
        ) : (
          <div className="flex flex-col gap-2 p-1">
            {pending.map((req) => (
              <div key={req.id} data-testid="buyin-request-row" className="rounded-lg border border-white/10 bg-secondary/50 p-3">
                <p className="text-sm font-medium">{req.playerDisplayName}</p>
                <p className="text-lg font-bold text-[var(--gold)] tabular-nums">
                  {formatChips(req.amount)} chips
                </p>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  {req.type === "initial" ? "Initial buy-in" : "Additional chip request"}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => onResolve(req.id, false)}
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-[var(--gold)] text-black hover:bg-[var(--gold)]/90"
                    onClick={() => onResolve(req.id, true)}
                  >
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
