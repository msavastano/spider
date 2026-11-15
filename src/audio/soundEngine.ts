import type { UserSettings } from '../engine/types';

type AudioContextConstructor = typeof AudioContext;

function resolveAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const win = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Procedural Web Audio API sound synthesizer for tactile card Foley and refined
 * cardroom harmonic cues. Zero external audio assets required.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;
  private volume = 0.72;
  private unlocked = false;

  constructor() {
    // AudioContext is created lazily on unlock/first gesture to satisfy browser autoplay rules.
  }

  applySettings(settings: UserSettings): void {
    this.enabled = settings.soundEnabled;
    this.volume = clamp(settings.soundVolume, 0, 1);

    if (this.ctx && this.masterGain) {
      const targetGain = this.enabled ? this.volume : 0;
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(targetGain, now, 0.015);
    }
  }

  unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {
        // Ignore resume errors outside active user gestures.
      });
    }

    if (!this.unlocked) {
      this.unlocked = true;
      try {
        // Play a 1-sample silent buffer to unlock iOS/Safari WebKit audio pipelines.
        const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = silent;
        src.connect(ctx.destination);
        src.start(0);
      } catch {
        // Safe fallback if browser restricts buffer creation before full activation.
      }
    }
  }

  playPickup(): void {
    const ctx = this.readyForPlayback();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    // Crisp linen slide off baize felt
    this.scheduleNoiseBurst(ctx, {
      startTime: now,
      duration: 0.042,
      filterType: 'bandpass',
      freqStart: 1700,
      freqEnd: 3100,
      q: 1.5,
      gain: 0.14,
      pan: -0.05,
    });

    // Subtle paper edge lift transient
    this.scheduleTone(ctx, {
      startTime: now,
      duration: 0.026,
      type: 'triangle',
      freqStart: 360,
      freqEnd: 580,
      gain: 0.045,
      attack: 0.003,
    });
  }

  playPlace(stackSize = 1): void {
    const ctx = this.readyForPlayback();
    if (!ctx) {
      return;
    }

    const count = clamp(Math.round(stackSize), 1, 13);
    const weight = 1 + (count - 1) * 0.035;
    const now = ctx.currentTime;

    // Warm padded-table settle thump
    this.scheduleTone(ctx, {
      startTime: now,
      duration: 0.068,
      type: 'sine',
      freqStart: Math.max(105, 165 - count * 3.5),
      freqEnd: 64,
      gain: Math.min(0.24, 0.14 * weight),
      attack: 0.002,
    });

    // Soft cardstock settle brush
    this.scheduleNoiseBurst(ctx, {
      startTime: now + 0.003,
      duration: 0.048,
      filterType: 'bandpass',
      freqStart: 1250,
      freqEnd: 820,
      q: 1.1,
      gain: 0.13,
    });

    // Multi-card stack flutter accent
    if (count > 1) {
      this.scheduleNoiseBurst(ctx, {
        startTime: now + 0.016,
        duration: 0.036,
        filterType: 'highpass',
        freqStart: 2100,
        freqEnd: 1700,
        q: 0.8,
        gain: Math.min(0.11, 0.035 + count * 0.008),
      });
    }
  }

  playFlip(): void {
    const ctx = this.readyForPlayback();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    // Rapid paper whip
    this.scheduleNoiseBurst(ctx, {
      startTime: now,
      duration: 0.052,
      filterType: 'bandpass',
      freqStart: 2550,
      freqEnd: 1350,
      q: 1.35,
      gain: 0.17,
    });

    // Crisp turn snap
    this.scheduleTone(ctx, {
      startTime: now + 0.004,
      duration: 0.032,
      type: 'triangle',
      freqStart: 540,
      freqEnd: 230,
      gain: 0.065,
      attack: 0.002,
    });
  }

  playDealCard(index = 0): void {
    const ctx = this.readyForPlayback();
    if (!ctx) {
      return;
    }

    const colNorm = ((index % 16) / 15) * 2 - 1;
    const pan = clamp(colNorm * 0.42, -0.45, 0.45);
    const brightness = 1650 + (index % 16) * 55;
    const now = ctx.currentTime;

    // Quick deal flick
    this.scheduleNoiseBurst(ctx, {
      startTime: now,
      duration: 0.038,
      filterType: 'bandpass',
      freqStart: brightness,
      freqEnd: brightness * 0.72,
      q: 1.6,
      gain: 0.125,
      pan,
    });

    // Soft landing tap
    this.scheduleTone(ctx, {
      startTime: now + 0.018,
      duration: 0.038,
      type: 'sine',
      freqStart: 175 + (index % 6) * 8,
      freqEnd: 78,
      gain: 0.075,
      attack: 0.002,
      pan,
    });
  }

  playCompleteSuit(): void {
    const ctx = this.readyForPlayback();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    // Silky cascade gather brush
    this.scheduleNoiseBurst(ctx, {
      startTime: now,
      duration: 0.14,
      filterType: 'bandpass',
      freqStart: 1200,
      freqEnd: 2900,
      q: 1.1,
      gain: 0.1,
    });

    // Refined warm major triad ascent (C5 - E5 - G5 - C6)
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const t = now + i * 0.062;
      this.scheduleTone(ctx, {
        startTime: t,
        duration: 0.34,
        type: 'triangle',
        freqStart: freq,
        freqEnd: freq,
        gain: 0.095,
        attack: 0.008,
      });
      this.scheduleTone(ctx, {
        startTime: t,
        duration: 0.38,
        type: 'sine',
        freqStart: freq * 2,
        freqEnd: freq * 2,
        gain: 0.025,
        attack: 0.01,
      });
    });
  }

  playUndo(): void {
    const ctx = this.readyForPlayback();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    // Soft reverse sweep
    this.scheduleNoiseBurst(ctx, {
      startTime: now,
      duration: 0.062,
      filterType: 'bandpass',
      freqStart: 2050,
      freqEnd: 780,
      q: 1.3,
      gain: 0.12,
    });

    // Subtle descending step
    this.scheduleTone(ctx, {
      startTime: now,
      duration: 0.055,
      type: 'sine',
      freqStart: 360,
      freqEnd: 230,
      gain: 0.065,
      attack: 0.003,
    });
  }

  playHint(): void {
    const ctx = this.readyForPlayback();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    // Gentle double-bell shimmer (A5 + E6)
    this.scheduleTone(ctx, {
      startTime: now,
      duration: 0.24,
      type: 'sine',
      freqStart: 880,
      freqEnd: 880,
      gain: 0.075,
      attack: 0.007,
    });
    this.scheduleTone(ctx, {
      startTime: now + 0.045,
      duration: 0.28,
      type: 'sine',
      freqStart: 1318.51,
      freqEnd: 1318.51,
      gain: 0.06,
      attack: 0.008,
    });
  }

  playBlocked(): void {
    const ctx = this.readyForPlayback();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    // Two soft wooden rail taps — tactile denial without harsh buzzer
    this.scheduleTone(ctx, {
      startTime: now,
      duration: 0.075,
      type: 'triangle',
      freqStart: 148,
      freqEnd: 88,
      gain: 0.13,
      attack: 0.003,
    });
    this.scheduleTone(ctx, {
      startTime: now + 0.065,
      duration: 0.075,
      type: 'triangle',
      freqStart: 122,
      freqEnd: 74,
      gain: 0.1,
      attack: 0.003,
    });
  }

  playVictory(): void {
    const ctx = this.readyForPlayback();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    // Warm luxury cardroom celebratory cascade (Cmaj9)
    const arpeggio = [261.63, 392.0, 493.88, 587.33, 659.25, 783.99, 987.77, 1046.5];

    arpeggio.forEach((freq, i) => {
      const t = now + i * 0.075;
      const isFinal = i === arpeggio.length - 1;
      const dur = isFinal ? 1.15 : 0.45;
      this.scheduleTone(ctx, {
        startTime: t,
        duration: dur,
        type: 'triangle',
        freqStart: freq,
        freqEnd: freq,
        gain: isFinal ? 0.11 : 0.08,
        attack: 0.01,
        pan: ((i / (arpeggio.length - 1)) * 2 - 1) * 0.3,
      });
      this.scheduleTone(ctx, {
        startTime: t,
        duration: dur * 1.1,
        type: 'sine',
        freqStart: freq * 2,
        freqEnd: freq * 2,
        gain: 0.022,
        attack: 0.012,
      });
    });

    // Warm grounding bass pad under the final tonic
    this.scheduleTone(ctx, {
      startTime: now + 0.52,
      duration: 1.25,
      type: 'sine',
      freqStart: 130.81,
      freqEnd: 130.81,
      gain: 0.09,
      attack: 0.04,
    });
  }

  dispose(): void {
    this.masterGain?.disconnect();
    this.compressor?.disconnect();
    if (this.ctx) {
      void this.ctx.close().catch(() => {
        // Ignore close errors.
      });
      this.ctx = null;
      this.masterGain = null;
      this.compressor = null;
      this.noiseBuffer = null;
      this.unlocked = false;
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) {
      return this.ctx;
    }
    const Ctor = resolveAudioContextConstructor();
    if (!Ctor) {
      return null;
    }

    try {
      const ctx = new Ctor();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-16, ctx.currentTime);
      compressor.knee.setValueAtTime(14, ctx.currentTime);
      compressor.ratio.setValueAtTime(4, ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      compressor.release.setValueAtTime(0.15, ctx.currentTime);

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(this.enabled ? this.volume : 0, ctx.currentTime);

      masterGain.connect(compressor);
      compressor.connect(ctx.destination);

      this.ctx = ctx;
      this.masterGain = masterGain;
      this.compressor = compressor;
      this.noiseBuffer = this.createNoiseBuffer(ctx);
      return ctx;
    } catch {
      return null;
    }
  }

  private readyForPlayback(): AudioContext | null {
    if (!this.enabled || this.volume <= 0.001) {
      return null;
    }
    const ctx = this.ensureContext();
    if (!ctx) {
      return null;
    }
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {
        // Ignore autoplay resume rejection when called without a gesture.
      });
    }
    return ctx;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 1.0);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Subtle pink-tinted white noise for realistic paper/felt texture
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.45) * 0.24;
    }
    return buffer;
  }

  private scheduleNoiseBurst(
    ctx: AudioContext,
    opts: {
      startTime: number;
      duration: number;
      filterType: BiquadFilterType;
      freqStart: number;
      freqEnd: number;
      q: number;
      gain: number;
      pan?: number;
    },
  ): void {
    if (!this.masterGain || !this.noiseBuffer) {
      return;
    }

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType;
    filter.Q.setValueAtTime(opts.q, opts.startTime);
    filter.frequency.setValueAtTime(opts.freqStart, opts.startTime);
    if (opts.freqEnd !== opts.freqStart) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(40, opts.freqEnd),
        opts.startTime + opts.duration,
      );
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, opts.startTime);
    env.gain.linearRampToValueAtTime(opts.gain, opts.startTime + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, opts.startTime + opts.duration);

    src.connect(filter);
    filter.connect(env);
    this.connectOutput(ctx, env, opts.pan);

    const maxOffset = Math.max(0, this.noiseBuffer.duration - opts.duration - 0.05);
    const offset = Math.random() * maxOffset;
    src.start(opts.startTime, offset, opts.duration + 0.02);
    src.stop(opts.startTime + opts.duration + 0.02);
  }

  private scheduleTone(
    ctx: AudioContext,
    opts: {
      startTime: number;
      duration: number;
      type: OscillatorType;
      freqStart: number;
      freqEnd: number;
      gain: number;
      attack: number;
      pan?: number;
    },
  ): void {
    if (!this.masterGain) {
      return;
    }

    const osc = ctx.createOscillator();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.freqStart, opts.startTime);
    if (opts.freqEnd !== opts.freqStart) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(25, opts.freqEnd),
        opts.startTime + opts.duration,
      );
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, opts.startTime);
    env.gain.linearRampToValueAtTime(opts.gain, opts.startTime + opts.attack);
    env.gain.exponentialRampToValueAtTime(0.0001, opts.startTime + opts.duration);

    osc.connect(env);
    this.connectOutput(ctx, env, opts.pan);

    osc.start(opts.startTime);
    osc.stop(opts.startTime + opts.duration + 0.02);
  }

  private connectOutput(ctx: AudioContext, node: AudioNode, pan?: number): void {
    if (!this.masterGain) {
      return;
    }
    if (pan !== undefined && Math.abs(pan) > 0.01 && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(clamp(pan, -1, 1), ctx.currentTime);
      node.connect(panner);
      panner.connect(this.masterGain);
      return;
    }
    node.connect(this.masterGain);
  }
}
