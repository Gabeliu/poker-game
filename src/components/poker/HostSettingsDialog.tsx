"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatChips } from "@/lib/format";
import { hasBlindErrors, parseBlindText, validateBlindText } from "@/lib/blinds";
import { MAX_TURN_SECONDS, MIN_TURN_SECONDS } from "@/lib/roomLimits";
import type { PublicPlayer, RoomSettings } from "@/lib/types";
import { ConfirmRemoveDialog } from "./ConfirmRemoveDialog";
import { BlindFields } from "./BlindFields";

interface HostSettingsDialogProps {
  settings: RoomSettings;
  players: PublicPlayer[];
  hostPlayerId: string;
  onUpdateSettings: (settings: Partial<RoomSettings>) => Promise<{ ok: true } | { ok: false; error: string }>;
  onRemovePlayer: (playerId: string) => void;
  onTransferOwnership: (playerId: string) => void;
  children: React.ReactNode;
}

export function HostSettingsDialog({
  settings,
  players,
  hostPlayerId,
  onUpdateSettings,
  onRemovePlayer,
  onTransferOwnership,
  children,
}: HostSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(settings);
  // Blinds are edited as text so a field can be cleared and retyped; they're
  // only turned into numbers (after validation) when saving.
  const [blinds, setBlinds] = useState({ smallBlind: String(settings.smallBlind), bigBlind: String(settings.bigBlind) });
  // Same for the other number fields: typed as text, checked before saving.
  // (As number inputs, a cleared timer field was sent as 0 and quietly became
  // a 5-second clock, and nothing stopped a minimum buy-in above the maximum.)
  const [limits, setLimits] = useState(limitsText(settings));
  const [saveError, setSaveError] = useState<string | null>(null);
  const blindErrors = validateBlindText(blinds.smallBlind, blinds.bigBlind);
  const turnSeconds = limits.turnSeconds === "" ? NaN : Number(limits.turnSeconds);
  const turnError =
    Number.isFinite(turnSeconds) && turnSeconds >= MIN_TURN_SECONDS && turnSeconds <= MAX_TURN_SECONDS
      ? null
      : `Enter ${MIN_TURN_SECONDS} to ${MAX_TURN_SECONDS} seconds.`;
  const minBuyIn = limits.minBuyIn === "" ? null : Number(limits.minBuyIn);
  const maxBuyIn = limits.maxBuyIn === "" ? null : Number(limits.maxBuyIn);
  const minBuyInError = minBuyIn === 0 ? "Must be greater than zero." : null;
  const maxBuyInError =
    maxBuyIn === 0
      ? "Must be greater than zero."
      : minBuyIn != null && maxBuyIn != null && maxBuyIn < minBuyIn
        ? "Must be at least the minimum."
        : null;
  const hasErrors = hasBlindErrors(blindErrors) || Boolean(turnError || minBuyInError || maxBuyInError);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const pendingRemovePlayer = players.find((p) => p.id === pendingRemoveId);

  const save = async () => {
    if (hasErrors) return;
    setSaveError(null);
    const res = await onUpdateSettings({
      ...form,
      smallBlind: parseBlindText(blinds.smallBlind),
      bigBlind: parseBlindText(blinds.bigBlind),
      minBuyIn,
      maxBuyIn,
      turnTimeLimitSeconds: turnSeconds,
    });
    // The server has the final say (e.g. blinds can't change mid-hand).
    if (res.ok) setOpen(false);
    else setSaveError(res.error);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setForm(settings);
          setBlinds({ smallBlind: String(settings.smallBlind), bigBlind: String(settings.bigBlind) });
          setLimits(limitsText(settings));
          setSaveError(null);
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Room settings</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="settings">
          <TabsList className="w-full">
            <TabsTrigger value="settings" className="flex-1">
              Table
            </TabsTrigger>
            <TabsTrigger value="players" className="flex-1">
              Players
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="flex flex-col gap-3 pt-2">
            <div className="grid gap-1.5">
              <Label>Room name</Label>
              <Input value={form.roomName} onChange={(e) => setForm({ ...form, roomName: e.target.value })} />
            </div>
            <BlindFields idPrefix="settings-" smallBlind={blinds.smallBlind} bigBlind={blinds.bigBlind} onChange={setBlinds} />
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                id="settings-min-buyin"
                label="Min buy-in"
                placeholder="No minimum"
                value={limits.minBuyIn}
                error={minBuyInError}
                onChange={(v) => setLimits({ ...limits, minBuyIn: v })}
              />
              <NumberField
                id="settings-max-buyin"
                label="Max buy-in"
                placeholder="No maximum"
                value={limits.maxBuyIn}
                error={maxBuyInError}
                onChange={(v) => setLimits({ ...limits, maxBuyIn: v })}
              />
            </div>
            <NumberField
              id="settings-turn-seconds"
              label="Turn time limit (seconds)"
              value={limits.turnSeconds}
              error={turnError}
              maxDigits={3}
              onChange={(v) => setLimits({ ...limits, turnSeconds: v })}
            />
            <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
              <Label htmlFor="allow-topups" className="text-sm font-normal">
                Allow additional buy-ins
              </Label>
              <Switch
                id="allow-topups"
                checked={form.allowAdditionalBuyIns}
                onCheckedChange={(v) => setForm({ ...form, allowAdditionalBuyIns: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
              <Label htmlFor="allow-join" className="text-sm font-normal">
                Allow joining mid-hand
              </Label>
              <Switch
                id="allow-join"
                checked={form.allowJoinDuringHand}
                onCheckedChange={(v) => setForm({ ...form, allowJoinDuringHand: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
              <Label htmlFor="run-it-twice" className="text-sm font-normal">
                Allow run it twice
              </Label>
              <Switch
                id="run-it-twice"
                checked={form.runItTwiceEnabled}
                onCheckedChange={(v) => setForm({ ...form, runItTwiceEnabled: v })}
              />
            </div>
            <DialogFooter className="pt-2">
              {saveError && (
                <p role="alert" className="mb-2 text-xs text-destructive" data-testid="settings-save-error">
                  {saveError}
                </p>
              )}
              <Button
                onClick={save}
                disabled={hasErrors}
                data-testid="settings-save"
                className="w-full bg-[var(--accent-lime)] text-[var(--accent-lime-foreground)] hover:bg-[var(--accent-lime)]/90"
              >
                Save settings
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="players" className="pt-2">
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
              {players.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">
                      {p.displayName} {p.id === hostPlayerId && <span className="text-[var(--accent-lime)]">(host)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">{formatChips(p.chips)} chips</p>
                  </div>
                  {p.id !== hostPlayerId && (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => onTransferOwnership(p.id)}>
                        Make host
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive/40 text-destructive hover:bg-destructive/10"
                        onClick={() => setPendingRemoveId(p.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
      {pendingRemovePlayer && (
        <ConfirmRemoveDialog
          playerName={pendingRemovePlayer.displayName}
          open={Boolean(pendingRemoveId)}
          onOpenChange={(v) => { if (!v) setPendingRemoveId(null); }}
          onConfirm={() => onRemovePlayer(pendingRemovePlayer.id)}
        />
      )}
    </Dialog>
  );
}

function limitsText(settings: RoomSettings) {
  return {
    minBuyIn: settings.minBuyIn == null ? "" : String(settings.minBuyIn),
    maxBuyIn: settings.maxBuyIn == null ? "" : String(settings.maxBuyIn),
    turnSeconds: String(settings.turnTimeLimitSeconds),
  };
}

/** A whole-number field edited as text: only digits get through, so it can be
 * cleared and retyped, and its problem (if any) is spelled out underneath. */
function NumberField({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
  maxDigits = 9,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  placeholder?: string;
  maxDigits?: number;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, maxDigits))}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive" data-testid={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
