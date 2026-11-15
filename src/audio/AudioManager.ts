import { SOUND_LIBRARY } from "./sounds";
import type { AudioSettings, PlayOptions, SoundEventName } from "./types";

const STORAGE_KEY = "felt-audio-settings-v1";

const DEFAULT_SETTINGS: AudioSettings = {
  enabled: true,
  masterVolume: 0.6,
  gameVolume: 1,
  notifyVolume: 1,
  playWhenSilenced: true,
};

/** A sound asked for while the context was still waking up is only worth
 * playing if it starts within this long — anything later would land as a
 * burst of stale effects the moment the context finally unlocks. */
const LATE_START_LIMIT_MS = 250;

/** The events that count as a user gesture for starting audio. `touchend`
 * and `click` are the ones iOS Safari honours; `pointerdown`/`touchstart`
 * (what this used to listen for) are not gestures there at all, so the
 * context never actually started on an iPhone. */
const UNLOCK_EVENTS = ["touchend", "pointerup", "click", "keydown"] as const;

type AudioSessionType = "auto" | "playback" | "ambient";

/** Ignore a repeat of the *same* event within this many ms — a cheap safety
 * net against accidental double-fires; the real dedup work happens in
 * useGameAudio by diffing authoritative room state. */
const MIN_REPEAT_GAP_MS = 35;

declare global {
  interface Window {
    __feltAudioLog?: { event: SoundEventName; at: number }[];
    /** The audio context's live state ("none" before one exists) — for tests. */
    __feltAudioState?: () => string;
    /** Suspends the context the way a phone does when the page is
     * backgrounded or a call comes in — for tests. */
    __feltAudioInterrupt?: () => Promise<void>;
  }
  interface Navigator {
    /** Audio Session API (Safari 16.4+): lets a page say how its audio should be treated. */
    audioSession?: { type: AudioSessionType };
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
      playWhenSilenced:
        typeof parsed.playWhenSilenced === "boolean" ? parsed.playWhenSilenced : DEFAULT_SETTINGS.playWhenSilenced,
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
    this.applyAudioSession();
    this.notify();
  }

  setEnabled(enabled: boolean): void {
    this.settings = { ...this.settings, enabled };
    this.persist();
    // Turning sound on is itself a tap — start the context right here
    // instead of waiting for the next one.
    if (enabled) this.unlock();
  }

  setPlayWhenSilenced(playWhenSilenced: boolean): void {
    this.settings = { ...this.settings, playWhenSilenced };
    this.persist();
  }

  /** Whether this browser lets a page opt out of the ring/silent switch
   * (the Audio Session API — in practice, iPhone and iPad). */
  canOverrideSilentSwitch(): boolean {
    return typeof navigator !== "undefined" && Boolean(navigator.audioSession);
  }

  /** On iOS, Web Audio defaults to the "ambient" category, which the
   * ring/silent switch mutes completely. "playback" is what video and music
   * use, and is audible regardless. Left on "auto" whenever sound is off or
   * the player would rather their phone's switch be respected. */
  private applyAudioSession(): void {
    try {
      const session = typeof navigator !== "undefined" ? navigator.audioSession : undefined;
      if (!session) return;
      const wanted: AudioSessionType = this.settings.enabled && this.settings.playWhenSilenced ? "playback" : "auto";
      if (session.type !== wanted) session.type = wanted;
    } catch {
      // Not supported, or not allowed right now — sound just follows the phone's own rules.
    }
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

  /** Starts listening for user gestures to start (and, after an
   * interruption, restart) the AudioContext, per browser autoplay policy.
   * Safe to call repeatedly.
   *
   * The listeners stay attached for the life of the page rather than firing
   * once: a phone suspends or interrupts the context every time the page is
   * backgrounded, the screen locks, or a call comes in, and the only thing
   * that can bring it back is another gesture. */
  attachUnlockListeners(): void {
    if (this.unlockAttached || typeof window === "undefined") return;
    this.unlockAttached = true;
    window.__feltAudioState = () => this.ctx?.state ?? "none";
    window.__feltAudioInterrupt = async () => {
      await this.ctx?.suspend();
    };
    const onGesture = () => this.unlock();
    for (const type of UNLOCK_EVENTS) {
      // Capture phase, so a control that stops propagation still counts.
      window.addEventListener(type, onGesture, { capture: true, passive: true });
    }
    // Coming back to the tab: some browsers will resume without a gesture,
    // and for the ones that won't, the next tap above does it.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.ctx && this.ctx.state !== "running") {
        void this.ctx.resume().catch(() => {});
      }
    });
  }

  /** Gets the context running from inside a user gesture. Cheap enough to
   * run on every tap: it does nothing once the context is already running. */
  private unlock(): void {
    try {
      if (!this.settings.enabled) return;
      this.applyAudioSession();
      const ctx = this.ensureContext();
      if (!ctx || ctx.state === "running") return;
      void ctx.resume().catch(() => {});
      // iOS only counts the context as user-started once a source has
      // actually been started inside the gesture — a silent single-sample
      // buffer is the standard way to do that.
      const source = ctx.createBufferSource();
      source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // Unlocking must never break the tap that triggered it.
    }
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
      this.logPlay(event, nowMs);

      const dest = def.bus === "game" ? this.gameGain : this.notifyGain;
      const start = () => {
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
      };

      if (ctx.state === "running") {
        start();
        return;
      }
      // Suspended (never unlocked yet) or interrupted (the phone took audio
      // away). Scheduling onto a stopped clock would queue every sound up
      // and fire them all together on the next tap, so ask for a resume and
      // only play if it comes through promptly.
      void ctx
        .resume()
        .then(() => {
          const waitedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - nowMs;
          if (ctx.state === "running" && waitedMs <= LATE_START_LIMIT_MS) start();
        })
        .catch(() => {});
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
