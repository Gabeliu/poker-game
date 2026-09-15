"use client";

import { useEffect, useState } from "react";
import { audioManager } from "@/audio/AudioManager";
import type { AudioSettings } from "@/audio/types";

/** Live-reads the shared AudioManager's settings and re-renders on change —
 * used by the sound control popover and anywhere else that shows mute/volume state. */
export function useAudioSettings(): AudioSettings & {
  setEnabled: (enabled: boolean) => void;
  setMasterVolume: (v: number) => void;
  setGameVolume: (v: number) => void;
  setNotifyVolume: (v: number) => void;
} {
  const [settings, setSettings] = useState<AudioSettings>(() => audioManager.getSettings());

  useEffect(() => {
    return audioManager.subscribe(() => setSettings(audioManager.getSettings()));
  }, []);

  return {
    ...settings,
    setEnabled: (enabled) => audioManager.setEnabled(enabled),
    setMasterVolume: (v) => audioManager.setMasterVolume(v),
    setGameVolume: (v) => audioManager.setGameVolume(v),
    setNotifyVolume: (v) => audioManager.setNotifyVolume(v),
  };
}
