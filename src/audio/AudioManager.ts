import { SOUND_LIBRARY } from "./sounds";
import type { AudioSettings, PlayOptions, SoundEventName } from "./types";

const STORAGE_KEY = "felt-audio-settings-v1";

const DEFAULT_SETTINGS: AudioSettings = {
  enabled: true,
  masterVolume: 0.6,
  gameVolume: 1,
  notifyVolume: 1,
};

/** Ignore a repeat of the *same* event within this many ms — a cheap safety
 * net against accidental double-fires; the real dedup work happens in
 * useGameAudio by diffing authoritative room state. */
const MIN_REPEAT_GAP_MS = 35;

declare global {
  interface Window {
    __feltAudioLog?: { event: SoundEventName; at: number }[];
  }
}

function loadSettings(): AudioSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_SETTINGS.enabled,
      masterVolume: clamp01(parsed.masterVolume, DEFAULT_SETTINGS.masterVolume),
      gameVolume: clamp01(parsed.gameVolume, DEFAULT_SETTINGS.gameVolume),
      notifyVolume: clamp01(parsed.notifyVolume, DEFAULT_SETTINGS.notifyVolume),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function clamp01(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function saveSettings(settings: AudioSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private browsing, disabled cookies) — sound settings just won't persist.
  }
}

/**
 * Centralized audio engine. Nothing in the app should touch AudioContext or
 * new Audio() directly — components call `audioManager.play("card-deal")`
 * and never know how a sound is actually produced.
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private gameGain: GainNode | null = null;
  private notifyGain: GainNode | null = null;
  private settings: AudioSettings = DEFAULT_SETTINGS;
  private listeners = new Set<() => void>();
  private lastPlayedAt = new Map<SoundEventName, number>();
  private unlockAttached = false;

  constructor() {
    this.settings = loadSettings();
  }

  getSettings(): AudioSettings {
    return this.settings;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  private persist(): void {
    saveSettings(this.settings);
    this.applyGains();
    this.notify();
  }

  setEnabled(enabled: boolean): void {
    this.settings = { ...this.settings, enabled };
    this.persist();
  }

  setMasterVolume(volume: number): void {
    this.settings = { ...this.settings, masterVolume: Math.max(0, Math.min(1, volume)) };
    this.persist();
  }

  setGameVolume(volume: number): void {
    this.settings = { ...this.settings, gameVolume: Math.max(0, Math.min(1, volume)) };
    this.persist();
  }

  setNotifyVolume(volume: number): void {
    this.settings = { ...this.settings, notifyVolume: Math.max(0, Math.min(1, volume)) };
    this.persist();
  }

  /** Attaches one-time listeners that unlock the AudioContext on the user's
   * first interaction, per browser autoplay policy. Safe to call repeatedly. */
  attachUnlockListeners(): void {
    if (this.unlockAttached || typeof window === "undefined") return;
    this.unlockAttached = true;
    const unlock = () => {
      this.ensureContext();
      void this.ctx?.resume().catch(() => {});
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      const game = ctx.createGain();
      const notify = ctx.createGain();
      game.connect(master);
      notify.connect(master);
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.masterGain = master;
      this.gameGain = game;
      this.notifyGain = notify;
      this.applyGains();
      return ctx;
    } catch {
      return null;
    }
  }

  private applyGains(): void {
    if (!this.ctx || !this.masterGain || !this.gameGain || !this.notifyGain) return;
    const now = this.ctx.currentTime;
    const master = this.settings.enabled ? this.settings.masterVolume : 0;
    this.masterGain.gain.setTargetAtTime(master, now, 0.03);
    this.gameGain.gain.setTargetAtTime(this.settings.gameVolume, now, 0.03);
    this.notifyGain.gain.setTargetAtTime(this.settings.notifyVolume, now, 0.03);
  }

  /** Plays a semantic sound event. Never throws — a failure here should
   * never be able to break gameplay. */
  play(event: SoundEventName, opts: PlayOptions = {}): void {
    try {
      if (!this.settings.enabled) return;
      const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
      const last = this.lastPlayedAt.get(event);
      if (last !== undefined && nowMs - last < MIN_REPEAT_GAP_MS) return;
      this.lastPlayedAt.set(event, nowMs);

      const def = SOUND_LIBRARY[event];
      if (!def) return;

      const ctx = this.ensureContext();
      if (!ctx || !this.gameGain || !this.notifyGain) return;
      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => {});
      }

      const dest = def.bus === "game" ? this.gameGain : this.notifyGain;
      const variation = Math.floor(Math.random() * def.variations);
      const startTime = ctx.currentTime + Math.max(0, opts.delaySeconds ?? 0);

      if (opts.gain !== undefined && opts.gain !== 1) {
        const trim = ctx.createGain();
        trim.gain.value = opts.gain;
        trim.connect(dest);
        def.recipe(ctx, trim, variation, opts.pan, startTime);
      } else {
        def.recipe(ctx, dest, variation, opts.pan, startTime);
      }

      this.logPlay(event, nowMs);
    } catch {
      // Synthesis failures must never break gameplay.
    }
  }

  private logPlay(event: SoundEventName, at: number): void {
    if (typeof window === "undefined") return;
    const log = (window.__feltAudioLog ??= []);
    log.push({ event, at });
    if (log.length > 200) log.splice(0, log.length - 200);
  }
}

export const audioManager = new AudioManager();
