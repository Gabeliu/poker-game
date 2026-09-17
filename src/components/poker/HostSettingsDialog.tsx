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
import type { PublicPlayer, RoomSettings } from "@/lib/types";
import { ConfirmRemoveDialog } from "./ConfirmRemoveDialog";

interface HostSettingsDialogProps {
  settings: RoomSettings;
  players: PublicPlayer[];
  hostPlayerId: string;
  onUpdateSettings: (settings: Partial<RoomSettings>) => void;
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
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const pendingRemovePlayer = players.find((p) => p.id === pendingRemoveId);

  const save = () => {
    onUpdateSettings(form);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setForm(settings);
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
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Small blind</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.smallBlind}
                  onChange={(e) => setForm({ ...form, smallBlind: Math.max(1, Number(e.target.value) || 1) })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Big blind</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.bigBlind}
                  onChange={(e) => setForm({ ...form, bigBlind: Math.max(1, Number(e.target.value) || 1) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Min buy-in</Label>
                <Input
                  type="number"
                  placeholder="No minimum"
                  value={form.minBuyIn ?? ""}
                  onChange={(e) => setForm({ ...form, minBuyIn: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Max buy-in</Label>
                <Input
                  type="number"
                  placeholder="No maximum"
                  value={form.maxBuyIn ?? ""}
                  onChange={(e) => setForm({ ...form, maxBuyIn: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Turn time limit (seconds)</Label>
              <Input
                type="number"
                value={form.turnTimeLimitSeconds}
                onChange={(e) => setForm({ ...form, turnTimeLimitSeconds: Number(e.target.value) })}
              />
            </div>
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
              <Button onClick={save} className="w-full bg-[var(--accent-lime)] text-[var(--accent-lime-foreground)] hover:bg-[var(--accent-lime)]/90">
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
