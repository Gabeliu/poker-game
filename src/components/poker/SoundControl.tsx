"use client";

import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useAudioSettings } from "@/hooks/useAudioSettings";

/** The header's sound control — a mute icon that reflects state at a glance,
 * with a small popover for the full set of volume controls. Available to
 * every player, not just the host, since sound preference is personal. */
export function SoundControl() {
  const { enabled, masterVolume, gameVolume, notifyVolume, setEnabled, setMasterVolume, setGameVolume, setNotifyVolume } =
    useAudioSettings();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid="sound-control-trigger"
          className="text-[var(--text-secondary)] hover:bg-white/8 hover:text-[var(--text-primary)]"
          title={enabled ? "Sound on" : "Sound muted"}
        >
          {enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 border-white/10 bg-black/80 p-3 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <Label htmlFor="sound-master-toggle" className="text-sm font-medium text-[var(--text-primary)]">
            Master Sound
          </Label>
          <Switch
            id="sound-master-toggle"
            data-testid="sound-master-toggle"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        <div className="mt-3 flex flex-col gap-1.5">
          <span className="text-xs text-[var(--text-secondary)]">Volume</span>
          <Slider
            data-testid="sound-volume-slider"
            value={[Math.round(masterVolume * 100)]}
            onValueChange={([v]) => setMasterVolume(v / 100)}
            min={0}
            max={100}
            step={1}
            disabled={!enabled}
          />
        </div>

        <div className="mt-3 flex flex-col gap-2 border-t border-white/8 pt-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--text-secondary)]">Game sounds</span>
            <Slider
              data-testid="sound-game-slider"
              className="w-24"
              value={[Math.round(gameVolume * 100)]}
              onValueChange={([v]) => setGameVolume(v / 100)}
              min={0}
              max={100}
              step={1}
              disabled={!enabled}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--text-secondary)]">Notifications</span>
            <Slider
              data-testid="sound-notify-slider"
              className="w-24"
              value={[Math.round(notifyVolume * 100)]}
              onValueChange={([v]) => setNotifyVolume(v / 100)}
              min={0}
              max={100}
              step={1}
              disabled={!enabled}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
