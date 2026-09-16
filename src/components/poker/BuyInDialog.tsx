"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatChips } from "@/lib/format";
import type { BuyInRequest, PublicPlayer, RoomSettings } from "@/lib/types";

interface BuyInDialogProps {
  player: PublicPlayer;
  settings: RoomSettings;
  pendingRequest: BuyInRequest | undefined;
  /** Buy-ins are only allowed between hands — while true, requesting is disabled. */
  handInProgress: boolean;
  onRequest: (amount: number, type: "initial" | "topup") => Promise<{ ok: true } | { ok: false; error: string }>;
  children: React.ReactNode;
}

export function BuyInDialog({ player, settings, pendingRequest, handInProgress, onRequest, children }: BuyInDialogProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(() => String(settings.minBuyIn ?? settings.bigBlind * 100));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTopUp = player.hasBoughtIn && player.chips > 0;

  const submit = async () => {
    const parsed = Number(amount.replace(/[,\s]/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a valid chip amount.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await onRequest(parsed, isTopUp ? "topup" : "initial");
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
    } else {
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        {pendingRequest ? (
          <>
            <DialogHeader>
              <DialogTitle>Buy-in requested</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <span className="text-3xl font-bold text-[var(--accent-lime)] tabular-nums">
                {formatChips(pendingRequest.amount)}
              </span>
              <span className="text-sm text-muted-foreground">chips</span>
              <p className="mt-2 text-sm text-muted-foreground">
                Waiting for the host to approve your request&hellip;
              </p>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{isTopUp ? "Request more chips" : "Buy in"}</DialogTitle>
              <DialogDescription>
                {handInProgress
                  ? "Buy-ins open back up as soon as the current hand finishes."
                  : isTopUp
                    ? "Ask the host to add more chips to your stack."
                    : "How many chips would you like to buy in for? The host must approve before you can play."}
              </DialogDescription>
            </DialogHeader>
            {!handInProgress && (
              <div className="flex flex-col gap-2 py-2">
                <Label htmlFor="buyin-amount">Amount</Label>
                <Input
                  id="buyin-amount"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="2,500"
                  autoFocus
                />
                {(settings.minBuyIn || settings.maxBuyIn) && (
                  <p className="text-xs text-muted-foreground">
                    {settings.minBuyIn ? `Min ${formatChips(settings.minBuyIn)}` : ""}
                    {settings.minBuyIn && settings.maxBuyIn ? " · " : ""}
                    {settings.maxBuyIn ? `Max ${formatChips(settings.maxBuyIn)}` : ""}
                  </p>
                )}
                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>
            )}
            {!handInProgress && (
              <DialogFooter>
                <Button
                  onClick={submit}
                  disabled={submitting}
                  data-testid="buyin-submit"
                  className="w-full bg-[var(--accent-lime)] text-[var(--accent-lime-foreground)] hover:bg-[var(--accent-lime)]/90"
                >
                  {isTopUp ? "Request more chips" : "Request Buy-In"}
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
