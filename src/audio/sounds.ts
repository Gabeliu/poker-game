import type { SoundBus, SoundEventName } from "./types";

/**
 * Every Felt sound is synthesized at runtime with the Web Audio API rather
 * than played from sample files — there are no licensing concerns, nothing
 * to download, and each play can be given its own small random variation
 * (pitch/timing/level) so repeated actions don't sound robotic.
 *
 * The palette stays deliberately restrained: short filtered-noise bursts for
 * card stock and felt, short resonant clicks for chips, and plain sine/
 * triangle tones (no vibrato, no square/saw "arcade" tones) for
 * notifications. Nothing here runs longer than ~600ms.
 */

let cachedNoiseBuffer: AudioBuffer | null = null;
let cachedNoiseCtx: BaseAudioContext | null = null;

function getNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  if (cachedNoiseBuffer && cachedNoiseCtx === ctx) return cachedNoiseBuffer;
  const length = Math.floor(ctx.sampleRate * 0.6);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  cachedNoiseBuffer = buffer;
  cachedNoiseCtx = ctx;
  return buffer;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function connectOut(ctx: AudioContext, node: AudioNode, dest: AudioNode, pan?: number): void {
  if (pan && typeof ctx.createStereoPanner === "function") {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(panner);
    panner.connect(dest);
  } else {
    node.connect(dest);
  }
}

interface NoiseOpts {
  startTime: number;
  duration: number;
  filterType?: BiquadFilterType;
  freq: number;
  q?: number;
  peak?: number;
  attack?: number;
  pan?: number;
}

function playFilteredNoise(ctx: AudioContext, dest: AudioNode, opts: NoiseOpts): void {
  const { startTime, duration, filterType = "bandpass", freq, q = 1, peak = 1, attack = 0.004, pan } = opts;
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peak, startTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  source.connect(filter);
  filter.connect(gain);
  connectOut(ctx, gain, dest, pan);

  source.start(startTime);
  source.stop(startTime + duration + 0.02);
}

interface ToneOpts {
  startTime: number;
  freq: number;
  endFreq?: number;
  duration: number;
  type?: OscillatorType;
  peak?: number;
  attack?: number;
  pan?: number;
}

function playTone(ctx: AudioContext, dest: AudioNode, opts: ToneOpts): void {
  const { startTime, freq, endFreq, duration, type = "sine", peak = 0.5, attack = 0.006, pan } = opts;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peak, startTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  connectOut(ctx, gain, dest, pan);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

/** A short "chip click" — a tight noise tick plus a bright resonant tone, like a ceramic chip knocking against the stack. */
function playChipClick(ctx: AudioContext, dest: AudioNode, startTime: number, pan: number | undefined, peak: number): void {
  playFilteredNoise(ctx, dest, {
    startTime,
    duration: rand(0.02, 0.035),
    filterType: "highpass",
    freq: rand(1800, 2600),
    q: 0.7,
    peak: peak * 0.6,
    attack: 0.001,
    pan,
  });
  playTone(ctx, dest, {
    startTime: startTime + 0.002,
    freq: rand(1400, 2200),
    endFreq: rand(900, 1300),
    duration: rand(0.05, 0.09),
    type: "triangle",
    peak: peak * 0.5,
    attack: 0.002,
    pan,
  });
}

function playChipCluster(ctx: AudioContext, dest: AudioNode, startTime: number, count: number, pan: number | undefined, peakBase: number): void {
  for (let i = 0; i < count; i++) {
    playChipClick(ctx, dest, startTime + i * rand(0.026, 0.048), pan, peakBase * rand(0.85, 1.1));
  }
}

/** A soft card-stock slide/flick. `sharp` gives the brighter, quicker "flip" variant. */
function playCardSlide(ctx: AudioContext, dest: AudioNode, startTime: number, pan: number | undefined, sharp: boolean): void {
  playFilteredNoise(ctx, dest, {
    startTime,
    duration: sharp ? rand(0.07, 0.1) : rand(0.09, 0.14),
    filterType: "bandpass",
    freq: sharp ? rand(2600, 3400) : rand(1600, 2200),
    q: 0.9,
    peak: sharp ? 0.5 : 0.38,
    attack: sharp ? 0.002 : 0.01,
    pan,
  });
}

function playTableTap(ctx: AudioContext, dest: AudioNode, startTime: number, pan?: number): void {
  playTone(ctx, dest, {
    startTime,
    freq: rand(150, 190),
    endFreq: rand(90, 120),
    duration: rand(0.07, 0.1),
    type: "sine",
    peak: 0.32,
    attack: 0.002,
    pan,
  });
  playFilteredNoise(ctx, dest, {
    startTime,
    duration: 0.04,
    filterType: "lowpass",
    freq: 400,
    peak: 0.12,
    attack: 0.001,
    pan,
  });
}

function playChime(ctx: AudioContext, dest: AudioNode, startTime: number, freqs: number[], pan: number | undefined, peak: number, noteGap = 0.09): void {
  freqs.forEach((freq, i) => {
    playTone(ctx, dest, {
      startTime: startTime + i * noteGap,
      freq,
      duration: 0.22,
      type: "sine",
      peak,
      attack: 0.012,
      pan,
    });
  });
}

export type SoundRecipe = (ctx: AudioContext, dest: AudioNode, variation: number, pan: number | undefined, startTime: number) => void;

interface SoundDefinition {
  bus: SoundBus;
  variations: number;
  recipe: SoundRecipe;
}

export const SOUND_LIBRARY: Record<SoundEventName, SoundDefinition> = {
  "card-deal": {
    bus: "game",
    variations: 3,
    recipe: (ctx, dest, _v, pan, t) => playCardSlide(ctx, dest, t, pan, false),
  },
  "card-flip": {
    bus: "game",
    variations: 3,
    recipe: (ctx, dest, _v, pan, t) => playCardSlide(ctx, dest, t, pan, true),
  },
  fold: {
    bus: "game",
    variations: 2,
    recipe: (ctx, dest, _v, pan, t) => {
      playCardSlide(ctx, dest, t, pan, false);
      playFilteredNoise(ctx, dest, { startTime: t + 0.05, duration: 0.09, filterType: "lowpass", freq: 900, peak: 0.18, attack: 0.01, pan });
    },
  },
  check: {
    bus: "game",
    variations: 3,
    recipe: (ctx, dest, _v, pan, t) => playTableTap(ctx, dest, t, pan),
  },
  call: {
    bus: "game",
    variations: 3,
    recipe: (ctx, dest, _v, pan, t) => playChipClick(ctx, dest, t, pan, 0.5),
  },
  bet: {
    bus: "game",
    variations: 3,
    recipe: (ctx, dest, _v, pan, t) => playChipCluster(ctx, dest, t, 2 + Math.round(Math.random()), pan, 0.42),
  },
  raise: {
    bus: "game",
    variations: 2,
    recipe: (ctx, dest, _v, pan, t) => {
      playChipCluster(ctx, dest, t, 3 + Math.round(Math.random()), pan, 0.5);
      playTone(ctx, dest, { startTime: t, freq: 110, duration: 0.12, type: "sine", peak: 0.14, attack: 0.005, pan });
    },
  },
  "all-in": {
    bus: "game",
    variations: 1,
    recipe: (ctx, dest, _v, pan, t) => {
      playChipCluster(ctx, dest, t, 5, pan, 0.5);
      playTone(ctx, dest, { startTime: t, freq: 95, duration: 0.2, type: "sine", peak: 0.2, attack: 0.008, pan });
    },
  },
  "pot-collect": {
    bus: "game",
    variations: 2,
    recipe: (ctx, dest, _v, pan, t) => playChipCluster(ctx, dest, t, 3, pan, 0.4),
  },
  "pot-win": {
    bus: "game",
    variations: 1,
    recipe: (ctx, dest, _v, pan, t) => {
      playFilteredNoise(ctx, dest, { startTime: t, duration: 0.32, filterType: "bandpass", freq: 1800, q: 0.6, peak: 0.28, attack: 0.03, pan });
      playChime(ctx, dest, t + 0.22, [660, 880], pan, 0.24, 0.1);
    },
  },
  "your-turn": {
    bus: "notify",
    variations: 1,
    recipe: (ctx, dest, _v, pan, t) => playTone(ctx, dest, { startTime: t, freq: 720, duration: 0.16, type: "sine", peak: 0.3, attack: 0.008, pan }),
  },
  "timer-low": {
    bus: "notify",
    variations: 1,
    recipe: (ctx, dest, _v, pan, t) => playTone(ctx, dest, { startTime: t, freq: 900, duration: 0.06, type: "sine", peak: 0.16, attack: 0.003, pan }),
  },
  "player-join": {
    bus: "notify",
    variations: 1,
    recipe: (ctx, dest, _v, pan, t) => playChime(ctx, dest, t, [520, 660], pan, 0.22, 0.08),
  },
  "player-leave": {
    bus: "notify",
    variations: 1,
    recipe: (ctx, dest, _v, pan, t) => playTone(ctx, dest, { startTime: t, freq: 340, endFreq: 240, duration: 0.22, type: "sine", peak: 0.18, attack: 0.01, pan }),
  },
  "buyin-request": {
    bus: "notify",
    variations: 1,
    recipe: (ctx, dest, _v, pan, t) => playChime(ctx, dest, t, [700, 560, 700], pan, 0.24, 0.07),
  },
  "buyin-approved": {
    bus: "notify",
    variations: 1,
    recipe: (ctx, dest, _v, pan, t) => {
      playChipClick(ctx, dest, t, pan, 0.45);
      playTone(ctx, dest, { startTime: t + 0.05, freq: 740, duration: 0.18, type: "sine", peak: 0.22, attack: 0.01, pan });
    },
  },
  "buyin-rejected": {
    bus: "notify",
    variations: 1,
    recipe: (ctx, dest, _v, pan, t) => playTone(ctx, dest, { startTime: t, freq: 260, duration: 0.2, type: "triangle", peak: 0.18, attack: 0.01, pan }),
  },
  "chat-message": {
    bus: "notify",
    variations: 2,
    recipe: (ctx, dest, _v, pan, t) => playTone(ctx, dest, { startTime: t, freq: rand(1000, 1200), duration: 0.045, type: "sine", peak: 0.12, attack: 0.002, pan }),
  },
  "ui-click": {
    bus: "notify",
    variations: 1,
    recipe: (ctx, dest, _v, pan, t) => playFilteredNoise(ctx, dest, { startTime: t, duration: 0.02, filterType: "highpass", freq: 3000, peak: 0.1, attack: 0.001, pan }),
  },
  "hand-start": {
    bus: "game",
    variations: 1,
    recipe: (ctx, dest, _v, pan, t) => {
      for (let i = 0; i < 6; i++) {
        playFilteredNoise(ctx, dest, {
          startTime: t + i * rand(0.045, 0.06),
          duration: rand(0.05, 0.08),
          filterType: "bandpass",
          freq: rand(1400, 2400),
          q: 1.2,
          peak: 0.22,
          attack: 0.004,
          pan,
        });
      }
    },
  },
  flop: {
    bus: "game",
    variations: 1,
    recipe: (ctx, dest, _v, pan, t) => {
      for (let i = 0; i < 3; i++) playCardSlide(ctx, dest, t + i * 0.1, pan, true);
    },
  },
  turn: {
    bus: "game",
    variations: 1,
    recipe: (ctx, dest, _v, pan, t) => playCardSlide(ctx, dest, t, pan, true),
  },
  river: {
    bus: "game",
    variations: 1,
    recipe: (ctx, dest, _v, pan, t) => playCardSlide(ctx, dest, t, pan, true),
  },
  showdown: {
    bus: "game",
    variations: 1,
    recipe: (ctx, dest, _v, pan, t) => {
      playCardSlide(ctx, dest, t, pan, false);
      playTone(ctx, dest, { startTime: t + 0.03, freq: 500, duration: 0.16, type: "sine", peak: 0.16, attack: 0.015, pan });
    },
  },
  winner: {
    bus: "game",
    variations: 1,
    recipe: (ctx, dest, _v, pan, t) => playChime(ctx, dest, t, [523, 659, 784], pan, 0.24, 0.11),
  },
};
