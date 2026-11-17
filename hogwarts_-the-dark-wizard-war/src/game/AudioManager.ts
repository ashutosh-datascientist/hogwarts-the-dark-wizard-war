import {
  AudioMixerSettings,
  CharacterAudioProfile,
  CharacterDefinition,
  SpellTier,
} from './types';
import { DestructionSoundKind } from './DestructibleEnvironment';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbReturnGain: GainNode | null = null;

  // 6 mixer buses
  private voicesGain: GainNode | null = null;
  private attacksGain: GainNode | null = null;
  private creaturesGain: GainNode | null = null;
  private shieldsGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private weatherGain: GainNode | null = null;
  private duckGain: GainNode | null = null;

  private rainSource: AudioBufferSourceNode | null = null;
  private musicTimer: number | null = null;
  private musicOscs: OscillatorNode[] = [];

  private shieldOsc1: OscillatorNode | null = null;
  private shieldOsc2: OscillatorNode | null = null;
  private shieldLfo: OscillatorNode | null = null;
  private shieldHumGain: GainNode | null = null;
  private shieldIsPlaying = false;

  private clashOscP: OscillatorNode | null = null;
  private clashOscO: OscillatorNode | null = null;
  private clashFilter: BiquadFilterNode | null = null;
  private clashGain: GainNode | null = null;
  private clashCrackleTimer = 0;

  private mixer: AudioMixerSettings = {
    masterMuted: false,
    masterVolume: 0.9,
    voicesEnabled: true,
    voicesVolume: 0.92,
    ttsFallbackEnabled: true,
    attacksVolume: 0.88,
    creaturesVolume: 0.9,
    shieldsVolume: 0.82,
    musicVolume: 0.55,
    weatherVolume: 0.68,
  };

  private initialized = false;
  private manifestChecked = false;
  private pendingVoiceTimer: number | null = null;
  private followUpVoiceTimer: number | null = null;
  private currentVoiceSource: AudioBufferSourceNode | null = null;
  private voiceSessionId = 0;
  private customVoiceClips = new Map<string, AudioBuffer>();
  private missingWarned = new Set<string>();
  private onVoiceAssetsChanged?: () => void;
  private distortionCurves = new Map<number, Float32Array<ArrayBuffer>>();

  public setOnVoiceAssetsChanged(cb: () => void): void {
    this.onVoiceAssetsChanged = cb;
  }

  public unlock(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -11;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 9;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.mixer.masterMuted ? 0 : this.mixer.masterVolume;
      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      this.duckGain = this.ctx.createGain();
      this.duckGain.gain.value = 1.0;
      this.duckGain.connect(this.masterGain);

      // 3.2s Dark Gothic Courtyard Cathedral Impulse Reverb
      this.reverbNode = this.ctx.createConvolver();
      this.reverbNode.buffer = this.buildCourtyardImpulse(3.2, 2.8);
      this.reverbReturnGain = this.ctx.createGain();
      this.reverbReturnGain.gain.value = 0.42;
      this.reverbNode.connect(this.reverbReturnGain);
      this.reverbReturnGain.connect(this.duckGain);

      this.voicesGain = this.ctx.createGain();
      this.voicesGain.gain.value = this.mixer.voicesEnabled ? this.mixer.voicesVolume : 0;
      this.voicesGain.connect(this.masterGain);

      this.attacksGain = this.ctx.createGain();
      this.attacksGain.gain.value = this.mixer.attacksVolume;
      this.attacksGain.connect(this.duckGain);
      this.attacksGain.connect(this.reverbNode);

      this.creaturesGain = this.ctx.createGain();
      this.creaturesGain.gain.value = this.mixer.creaturesVolume;
      this.creaturesGain.connect(this.duckGain);
      this.creaturesGain.connect(this.reverbNode);

      this.shieldsGain = this.ctx.createGain();
      this.shieldsGain.gain.value = this.mixer.shieldsVolume;
      this.shieldsGain.connect(this.duckGain);
      this.shieldsGain.connect(this.reverbNode);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.mixer.musicVolume * 0.24;
      this.musicGain.connect(this.duckGain);

      this.weatherGain = this.ctx.createGain();
      this.weatherGain.gain.value = this.mixer.weatherVolume;
      this.weatherGain.connect(this.duckGain);

      this.startRainBed();
      this.startEvolvingOrchestralPad();
      this.initialized = true;
      void this.preloadManifestVoices();
    } catch {
      // Gracefully degrade
    }
  }

  public async preloadManifestVoices(): Promise<void> {
    if (this.manifestChecked || !this.ctx) return;
    this.manifestChecked = true;
    try {
      const res = await fetch('/voices/manifest.json');
      if (!res.ok) return;
      const json = (await res.json()) as {
        victoryVoices?: Record<string, string>;
        defeatVoices?: Record<string, string>;
      };

      const tasks: Array<Promise<void>> = [];
      let loadedAny = false;

      const queueLoad = (charId: string, outcome: 'victory' | 'defeat', url: string) => {
        if (!url || !this.ctx) return;
        tasks.push(
          (async () => {
            try {
              const audioRes = await fetch(url);
              if (!audioRes.ok || !this.ctx) return;
              const arr = await audioRes.arrayBuffer();
              const buf = await this.ctx.decodeAudioData(arr);
              this.customVoiceClips.set(`${charId}:${outcome}`, buf);
              loadedAny = true;
            } catch {
              // Skip unreadable entry cleanly
            }
          })()
        );
      };

      Object.entries(json.victoryVoices ?? {}).forEach(([charId, url]) =>
        queueLoad(charId, 'victory', url)
      );
      Object.entries(json.defeatVoices ?? {}).forEach(([charId, url]) =>
        queueLoad(charId, 'defeat', url)
      );

      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
      if (loadedAny) {
        this.onVoiceAssetsChanged?.();
      }
    } catch {
      // Manifest absent or offline
    }
  }

  public getVoiceAssetMap(
    characterIds: string[]
  ): Record<string, { victory: boolean; defeat: boolean }> {
    const out: Record<string, { victory: boolean; defeat: boolean }> = {};
    for (let i = 0; i < characterIds.length; i++) {
      const id = characterIds[i];
      out[id] = {
        victory: this.customVoiceClips.has(`${id}:victory`),
        defeat: this.customVoiceClips.has(`${id}:defeat`),
      };
    }
    return out;
  }

  private buildCourtyardImpulse(duration: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * duration);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const w = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
        lp = lp * 0.45 + w * 0.55; // Warm stone-dampened tail
        data[i] = lp;
      }
    }
    return impulse;
  }

  private getDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const key = Math.round(amount * 20);
    const cached = this.distortionCurves.get(key);
    if (cached) return cached;

    const samples = 1024;
    const ab = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(ab);
    const k = 8 + amount * 85;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    this.distortionCurves.set(key, curve);
    return curve;
  }

  public getMixerSettings(): AudioMixerSettings {
    return { ...this.mixer };
  }

  public setMixerSettings(next: Partial<AudioMixerSettings>): void {
    this.mixer = { ...this.mixer, ...next };
    if (this.ctx) {
      const now = this.ctx.currentTime;
      if (this.masterGain) {
        this.masterGain.gain.setTargetAtTime(
          this.mixer.masterMuted ? 0 : this.mixer.masterVolume,
          now,
          0.04
        );
      }
      if (this.voicesGain) {
        this.voicesGain.gain.setTargetAtTime(
          this.mixer.voicesEnabled ? this.mixer.voicesVolume : 0,
          now,
          0.04
        );
      }
      if (this.attacksGain) {
        this.attacksGain.gain.setTargetAtTime(this.mixer.attacksVolume, now, 0.04);
      }
      if (this.creaturesGain) {
        this.creaturesGain.gain.setTargetAtTime(this.mixer.creaturesVolume, now, 0.04);
      }
      if (this.shieldsGain) {
        this.shieldsGain.gain.setTargetAtTime(this.mixer.shieldsVolume, now, 0.04);
      }
      if (this.musicGain) {
        this.musicGain.gain.setTargetAtTime(this.mixer.musicVolume * 0.24, now, 0.08);
      }
      if (this.weatherGain) {
        this.weatherGain.gain.setTargetAtTime(this.mixer.weatherVolume, now, 0.05);
      }
    }
    if (this.mixer.masterMuted || !this.mixer.voicesEnabled) {
      this.cancelMatchDialogue();
    }
  }

  public setMuted(muted: boolean): void {
    this.setMixerSettings({ masterMuted: muted });
  }

  public isMuted(): boolean {
    return this.mixer.masterMuted;
  }

  public async registerVoiceClip(key: string, file: File): Promise<void> {
    this.unlock();
    if (!this.ctx) return;
    const arr = await file.arrayBuffer();
    const buf = await this.ctx.decodeAudioData(arr);
    this.customVoiceClips.set(key, buf);
    this.onVoiceAssetsChanged?.();
  }

  private startRainBed(): void {
    if (!this.ctx || !this.weatherGain) return;
    const sr = this.ctx.sampleRate;
    const len = sr * 4;
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.996 * b0 + w * 0.031;
        b1 = 0.984 * b1 + w * 0.036;
        b2 = 0.94 * b2 + w * 0.05;
        const patter = Math.random() > 0.996 ? (Math.random() - 0.5) * 0.45 : 0;
        data[i] = (b0 + b1 + b2 + w * 0.06) * 0.32 + patter;
      }
    }

    this.rainSource = this.ctx.createBufferSource();
    this.rainSource.buffer = buf;
    this.rainSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1050;
    filter.Q.value = 0.55;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.25;

    this.rainSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.weatherGain);
    this.rainSource.start();
  }

  private startEvolvingOrchestralPad(): void {
    if (!this.ctx || !this.musicGain) return;

    const chords = [
      [73.42, 110.0, 174.61],
      [58.27, 87.31, 146.83],
      [49.0, 73.42, 116.54],
      [55.0, 82.41, 138.59],
    ];

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    filter.Q.value = 1.6;
    filter.connect(this.musicGain);

    const oscs: OscillatorNode[] = [];
    const types: OscillatorType[] = ['sawtooth', 'triangle', 'sine'];
    for (let i = 0; i < 3; i++) {
      const o = this.ctx.createOscillator();
      o.type = types[i];
      o.frequency.value = chords[0][i];
      o.detune.value = (i - 1) * 7;
      const g = this.ctx.createGain();
      g.gain.value = i === 0 ? 0.34 : i === 1 ? 0.28 : 0.2;
      o.connect(g);
      g.connect(filter);
      o.start();
      oscs.push(o);
    }
    this.musicOscs = oscs;

    let step = 0;
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || this.mixer.masterMuted) return;
      step = (step + 1) % chords.length;
      const now = this.ctx.currentTime;
      const chord = chords[step];
      for (let i = 0; i < 3; i++) {
        oscs[i].frequency.setTargetAtTime(chord[i], now, 0.85);
      }
      filter.frequency.setTargetAtTime(210 + (step % 2) * 95, now, 1.1);
    }, 5200);
  }

  public playThunder(intensity = 1.0): void {
    if (!this.ctx || !this.weatherGain || this.mixer.masterMuted) return;
    const now = this.ctx.currentTime;

    const crackLen = Math.floor(this.ctx.sampleRate * 0.3);
    const crackBuf = this.ctx.createBuffer(1, crackLen, this.ctx.sampleRate);
    const crackData = crackBuf.getChannelData(0);
    for (let i = 0; i < crackLen; i++) {
      crackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (crackLen * 0.18));
    }
    const crackSrc = this.ctx.createBufferSource();
    crackSrc.buffer = crackBuf;
    const crackFilter = this.ctx.createBiquadFilter();
    crackFilter.type = 'lowpass';
    crackFilter.frequency.value = 680;
    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(0.4 * intensity, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    crackSrc.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(this.weatherGain);
    crackSrc.start(now);

    const rumbleLen = Math.floor(this.ctx.sampleRate * 3.2);
    const rumbleBuf = this.ctx.createBuffer(1, rumbleLen, this.ctx.sampleRate);
    const rumbleData = rumbleBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < rumbleLen; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.035 * white) / 1.035;
      const env = Math.sin((i / rumbleLen) * Math.PI) * Math.exp(-i / (rumbleLen * 0.56));
      rumbleData[i] = last * 5.4 * env;
    }
    const rumbleSrc = this.ctx.createBufferSource();
    rumbleSrc.buffer = rumbleBuf;
    const rumbleFilter = this.ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 125;
    const rumbleGain = this.ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.68 * intensity, now + 0.1);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 3.15);
    rumbleSrc.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(this.weatherGain);
    rumbleSrc.start(now + 0.08);
  }

  /**
   * Dark rushing atmospheric noise turbulence (replaces electronic/toy sweeps)
   */
  private spawnDarkTurbulence(
    dest: AudioNode,
    startTime: number,
    duration: number,
    startFreq: number,
    endFreq: number,
    peakGain: number,
    q = 1.6
  ): void {
    if (!this.ctx) return;
    const len = Math.max(256, Math.floor(this.ctx.sampleRate * duration));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.sin(t * Math.PI) * (1 - t * 0.3);
      const w = Math.random() * 2 - 1;
      b0 = b0 * 0.78 + w * 0.22; // Brown-pink rumble noise, never harsh white hiss
      d[i] = (b0 * 2.2 + w * 0.25) * env;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(45, startFreq), startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(45, endFreq), startTime + duration);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, startTime);
    g.gain.linearRampToValueAtTime(peakGain, startTime + duration * 0.22);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(startTime);
  }

  private spawnElectricalCrackles(
    dest: AudioNode,
    startTime: number,
    duration: number,
    intensity: number
  ): void {
    if (!this.ctx || intensity <= 0.05) return;
    const pulseCount = Math.max(3, Math.round(intensity * duration * 20));
    for (let i = 0; i < pulseCount; i++) {
      const t = startTime + (i / pulseCount) * duration + Math.random() * 0.025;
      const snapLen = Math.floor(this.ctx.sampleRate * 0.018);
      const buf = this.ctx.createBuffer(1, snapLen, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let k = 0; k < snapLen; k++) {
        data[k] = (Math.random() * 2 - 1) * Math.exp(-k / (snapLen * 0.18));
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800 + Math.random() * 2400;
      bp.Q.value = 3.0;
      const g = this.ctx.createGain();
      g.gain.value = (0.08 + Math.random() * 0.1) * intensity;
      src.connect(bp);
      bp.connect(g);
      g.connect(dest);
      src.start(t);
    }
  }

  private spawnSubVibration(
    dest: AudioNode,
    startTime: number,
    startHz: number,
    endHz: number,
    duration: number,
    peakGain: number
  ): void {
    if (!this.ctx) return;
    const sub = this.ctx.createOscillator();
    const subG = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(Math.max(24, startHz), startTime);
    sub.frequency.exponentialRampToValueAtTime(Math.max(22, endHz), startTime + duration);
    subG.gain.setValueAtTime(0.002, startTime);
    subG.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.06, duration * 0.25));
    subG.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    sub.connect(subG);
    subG.connect(dest);
    sub.start(startTime);
    sub.stop(startTime + duration + 0.04);
  }

  /**
   * Wand charging swirl sound before releasing mid/ultimate magic
   */
  public playWandCharge(profile: CharacterAudioProfile): void {
    if (!this.ctx || !this.attacksGain || this.mixer.masterMuted) return;
    const now = this.ctx.currentTime;
    this.spawnDarkTurbulence(this.attacksGain, now, 0.35, 180, profile.whooshCutoff * 1.4, 0.24, 2.8);
    this.spawnElectricalCrackles(this.attacksGain, now, 0.3, profile.crackleIntensity * 0.65);
  }

  /**
   * Horror / Dark Fantasy Spell Release Audio (Zero pop-pop / zero toy lasers)
   */
  public playSpellCast(tier: SpellTier, profile: CharacterAudioProfile): void {
    if (!this.ctx || !this.attacksGain || this.mixer.masterMuted) return;
    const now = this.ctx.currentTime;
    const dest = this.attacksGain;

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.getDistortionCurve(profile.distortion);

    if (tier === 'BASIC') {
      // Dark resonant release + low sub-vibration + rushing wind shear
      const oscA = this.ctx.createOscillator();
      const oscB = this.ctx.createOscillator();
      oscA.type = profile.waveform;
      oscB.type = 'sawtooth';

      oscA.frequency.setValueAtTime(profile.baseFreq * 1.15, now);
      oscA.frequency.exponentialRampToValueAtTime(profile.subBassFreq * 1.1, now + 0.42);
      oscB.frequency.setValueAtTime(profile.baseFreq * profile.harmonicRatio * 1.18, now);
      oscB.frequency.exponentialRampToValueAtTime(profile.subBassFreq * 1.35, now + 0.4);

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 2.4;
      lp.frequency.setValueAtTime(profile.whooshCutoff * 0.85, now);
      lp.frequency.exponentialRampToValueAtTime(110, now + 0.42);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.005, now);
      g.gain.linearRampToValueAtTime(0.24, now + 0.045);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.44);

      oscA.connect(shaper);
      oscB.connect(shaper);
      shaper.connect(lp);
      lp.connect(g);
      g.connect(dest);

      oscA.start(now);
      oscB.start(now);
      oscA.stop(now + 0.46);
      oscB.stop(now + 0.46);

      this.spawnDarkTurbulence(dest, now, 0.36, profile.whooshCutoff, 180, 0.32, 1.5);
      this.spawnSubVibration(dest, now, profile.subBassFreq * 2.0, profile.subBassFreq * 0.78, 0.36, 0.28);
    } else if (tier === 'MID') {
      // Dark energy charging + deep rumbling + distortion + electrical crackling
      const oscA = this.ctx.createOscillator();
      const oscB = this.ctx.createOscillator();
      oscA.type = 'sawtooth';
      oscB.type = profile.waveform;

      oscA.frequency.setValueAtTime(profile.subBassFreq * 1.4, now);
      oscA.frequency.exponentialRampToValueAtTime(profile.baseFreq * 1.85, now + 0.22);
      oscA.frequency.exponentialRampToValueAtTime(profile.subBassFreq * 0.8, now + 0.85);

      oscB.frequency.setValueAtTime(profile.baseFreq * 0.9, now);
      oscB.frequency.exponentialRampToValueAtTime(profile.baseFreq * profile.harmonicRatio * 1.9, now + 0.22);
      oscB.frequency.exponentialRampToValueAtTime(profile.subBassFreq * 0.95, now + 0.82);

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 3.2;
      lp.frequency.setValueAtTime(220, now);
      lp.frequency.exponentialRampToValueAtTime(profile.whooshCutoff * 1.35, now + 0.24);
      lp.frequency.exponentialRampToValueAtTime(95, now + 0.86);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.005, now);
      g.gain.linearRampToValueAtTime(0.32, now + 0.2);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.88);

      oscA.connect(shaper);
      oscB.connect(shaper);
      shaper.connect(lp);
      lp.connect(g);
      g.connect(dest);

      oscA.start(now);
      oscB.start(now);
      oscA.stop(now + 0.9);
      oscB.stop(now + 0.9);

      this.spawnDarkTurbulence(dest, now + 0.04, 0.76, profile.whooshCutoff * 1.3, 120, 0.42, 1.4);
      this.spawnElectricalCrackles(dest, now + 0.08, 0.68, profile.crackleIntensity);
      this.spawnSubVibration(dest, now + 0.06, profile.subBassFreq * 1.8, profile.subBassFreq * 0.7, 0.82, 0.38);
    } else {
      // ULTIMATE CHARGE + SUPERNATURAL RELEASE
      this.playUltimateCharge(profile);
    }
  }

  public playUltimateCharge(profile: CharacterAudioProfile): void {
    if (!this.ctx || !this.attacksGain || this.mixer.masterMuted) return;
    const now = this.ctx.currentTime;
    const dest = this.attacksGain;

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.getDistortionCurve(Math.max(0.45, profile.distortion));

    const oscA = this.ctx.createOscillator();
    const oscB = this.ctx.createOscillator();
    const oscC = this.ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscB.type = profile.waveform;
    oscC.type = 'sawtooth';

    oscA.frequency.setValueAtTime(profile.subBassFreq * 0.85, now);
    oscA.frequency.exponentialRampToValueAtTime(profile.baseFreq * 1.8, now + 0.78);
    oscA.frequency.exponentialRampToValueAtTime(profile.subBassFreq * 0.65, now + 1.85);

    oscB.frequency.setValueAtTime(profile.baseFreq * 0.75, now);
    oscB.frequency.exponentialRampToValueAtTime(profile.baseFreq * profile.harmonicRatio * 1.8, now + 0.78);
    oscB.frequency.exponentialRampToValueAtTime(profile.subBassFreq * 0.9, now + 1.8);

    oscC.frequency.setValueAtTime(profile.baseFreq * 1.45, now);
    oscC.frequency.exponentialRampToValueAtTime(profile.baseFreq * 2.5, now + 0.8);
    oscC.frequency.exponentialRampToValueAtTime(profile.baseFreq * 0.55, now + 1.75);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3.0;
    lp.frequency.setValueAtTime(140, now);
    lp.frequency.exponentialRampToValueAtTime(profile.whooshCutoff * 1.9, now + 0.8);
    lp.frequency.exponentialRampToValueAtTime(95, now + 1.85);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.005, now);
    g.gain.linearRampToValueAtTime(0.42, now + 0.8);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.9);

    oscA.connect(shaper);
    oscB.connect(shaper);
    oscC.connect(shaper);
    shaper.connect(lp);
    lp.connect(g);
    g.connect(dest);

    oscA.start(now);
    oscB.start(now);
    oscC.start(now);
    oscA.stop(now + 1.92);
    oscB.stop(now + 1.92);
    oscC.stop(now + 1.92);

    this.spawnDarkTurbulence(dest, now, 0.82, 160, profile.whooshCutoff * 1.8, 0.34, 2.0);
    this.spawnDarkTurbulence(dest, now + 0.78, 1.05, profile.whooshCutoff * 2.0, 85, 0.48, 1.2);
    this.spawnElectricalCrackles(dest, now + 0.25, 1.4, Math.max(0.55, profile.crackleIntensity));
    this.spawnSubVibration(dest, now + 0.1, profile.subBassFreq * 1.4, 28, 1.75, 0.48);
  }

  /**
   * Individual creature cries, serpent hisses, raven shrieks, wolf howls, stag cries, dragon roars
   */
  public playCreatureCry(profile: CharacterAudioProfile): void {
    if (!this.ctx || !this.creaturesGain || this.mixer.masterMuted) return;
    const now = this.ctx.currentTime;
    const dest = this.creaturesGain;
    const style = profile.creatureSoundStyle;

    if (style === 'phoenix') {
      // Soaring majestic harmonic phoenix cry
      const o1 = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      o1.type = 'triangle';
      o2.type = 'sine';
      o1.frequency.setValueAtTime(520, now);
      o1.frequency.exponentialRampToValueAtTime(1240, now + 0.35);
      o1.frequency.exponentialRampToValueAtTime(680, now + 1.35);
      o2.frequency.setValueAtTime(780, now);
      o2.frequency.exponentialRampToValueAtTime(1860, now + 0.35);
      o2.frequency.exponentialRampToValueAtTime(920, now + 1.35);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.005, now);
      g.gain.linearRampToValueAtTime(0.28, now + 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
      o1.connect(g);
      o2.connect(g);
      g.connect(dest);
      o1.start(now);
      o2.start(now);
      o1.stop(now + 1.42);
      o2.stop(now + 1.42);
      this.spawnDarkTurbulence(dest, now + 0.1, 1.1, 1400, 320, 0.35, 1.2);
    } else if (style === 'giant_serpent' || style === 'shadow_serpent' || style === 'dark_serpent') {
      // Deep terrifying modulated serpent hiss + sub-bass demonic roar
      const dur = style === 'giant_serpent' ? 1.5 : 1.05;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const mod = 0.6 + 0.4 * Math.sin(t * 42);
        const env = Math.sin(t * Math.PI);
        d[i] = (Math.random() * 2 - 1) * mod * env;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const formant = this.ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.Q.value = style === 'shadow_serpent' ? 5.5 : 4.2;
      formant.frequency.setValueAtTime(style === 'shadow_serpent' ? 3200 : 2100, now);
      formant.frequency.exponentialRampToValueAtTime(1250, now + dur);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(style === 'giant_serpent' ? 0.48 : 0.36, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(formant);
      formant.connect(g);
      g.connect(dest);
      src.start(now);

      this.spawnSubVibration(dest, now, style === 'giant_serpent' ? 78 : 110, 32, dur, 0.44);
    } else if (style === 'raven_shriek') {
      // Multiple frightening jagged raven caw/shriek bursts
      for (let k = 0; k < 4; k++) {
        const t = now + k * 0.22;
        const o = this.ctx.createOscillator();
        const sh = this.ctx.createWaveShaper();
        sh.curve = this.getDistortionCurve(0.9);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(760 + k * 65, t);
        o.frequency.exponentialRampToValueAtTime(420, t + 0.19);
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1450;
        bp.Q.value = 2.6;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.24, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        o.connect(sh);
        sh.connect(bp);
        bp.connect(g);
        g.connect(dest);
        o.start(t);
        o.stop(t + 0.22);
      }
    } else if (style === 'stag_cry' || style === 'wolf_howl') {
      // Majestic stag bugle cry / eerie moonlit wolf howl
      const o = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o2.type = 'triangle';
      const base = style === 'stag_cry' ? 240 : 290;
      o.frequency.setValueAtTime(base, now);
      o.frequency.exponentialRampToValueAtTime(base * 1.9, now + 0.28);
      o.frequency.exponentialRampToValueAtTime(base * 0.85, now + 1.25);
      o2.frequency.setValueAtTime(base * 1.5, now);
      o2.frequency.exponentialRampToValueAtTime(base * 2.4, now + 0.3);
      o2.frequency.exponentialRampToValueAtTime(base, now + 1.25);

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 980;
      lp.Q.value = 3.2;

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.01, now);
      g.gain.linearRampToValueAtTime(0.32, now + 0.16);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.28);

      o.connect(lp);
      o2.connect(lp);
      lp.connect(g);
      g.connect(dest);
      o.start(now);
      o2.start(now);
      o.stop(now + 1.3);
      o2.stop(now + 1.3);
    } else if (style === 'dragon_roar') {
      // Terrifying Ice Wraith Dragon roar + frost shatter
      this.spawnSubVibration(dest, now, 115, 34, 1.3, 0.48);
      this.spawnDarkTurbulence(dest, now, 1.2, 2200, 260, 0.42, 2.2);
      this.spawnElectricalCrackles(dest, now + 0.1, 0.9, 0.9);
    } else if (style === 'elf_chime') {
      // Cosmic snap + deep liberating harmonic pulse
      this.spawnElectricalCrackles(dest, now, 0.25, 0.95);
      this.spawnSubVibration(dest, now + 0.05, 160, 44, 0.9, 0.4);
      const bell = this.ctx.createOscillator();
      bell.type = 'sine';
      bell.frequency.setValueAtTime(660, now);
      bell.frequency.exponentialRampToValueAtTime(440, now + 0.95);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.24, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
      bell.connect(g);
      g.connect(dest);
      bell.start(now);
      bell.stop(now + 0.98);
    } else {
      // Cat snarl, Owl screech, Hound growl, Fire Horse whinny, Thorn groan, Terrier bark
      const o = this.ctx.createOscillator();
      const sh = this.ctx.createWaveShaper();
      sh.curve = this.getDistortionCurve(0.55);
      o.type = 'sawtooth';
      const startF =
        style === 'owl_screech'
          ? 920
          : style === 'fire_horse'
            ? 560
            : style === 'cat_snarl'
              ? 420
              : style === 'thorn_groan'
                ? 95
                : 190;
      const endF = style === 'thorn_groan' ? 46 : startF * 0.48;
      o.frequency.setValueAtTime(startF, now);
      o.frequency.exponentialRampToValueAtTime(startF * 1.35, now + 0.14);
      o.frequency.exponentialRampToValueAtTime(endF, now + 0.95);

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'lowpass';
      bp.frequency.value = style === 'thorn_groan' ? 320 : 1400;
      bp.Q.value = 2.6;

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.01, now);
      g.gain.linearRampToValueAtTime(0.28, now + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.98);

      o.connect(sh);
      sh.connect(bp);
      bp.connect(g);
      g.connect(dest);
      o.start(now);
      o.stop(now + 1.0);
      this.spawnSubVibration(dest, now, 110, 38, 0.85, 0.34);
    }
  }

  public playCreatureMovement(profile: CharacterAudioProfile): void {
    if (!this.ctx || !this.creaturesGain || this.mixer.masterMuted) return;
    const now = this.ctx.currentTime;
    this.spawnDarkTurbulence(this.creaturesGain, now, 0.35, profile.whooshCutoff * 0.9, 140, 0.22, 1.3);
  }

  public playImpact(
    tier: SpellTier,
    profile: CharacterAudioProfile,
    blocked = false
  ): void {
    if (!this.ctx || !this.attacksGain || !this.shieldsGain || this.mixer.masterMuted) return;
    const now = this.ctx.currentTime;

    if (blocked) {
      const dest = this.shieldsGain;
      this.spawnDarkTurbulence(dest, now, 0.32, 950, 260, 0.25, 2.5);
      this.spawnElectricalCrackles(dest, now, 0.25, 0.8);
      this.spawnSubVibration(dest, now, 180, 70, 0.28, 0.22);
      return;
    }

    const dest = this.attacksGain;
    const dur = tier === 'ULTIMATE' ? 1.45 : tier === 'MID' ? 0.72 : 0.34;
    const peak = tier === 'ULTIMATE' ? 0.62 : tier === 'MID' ? 0.42 : 0.28;

    this.spawnSubVibration(dest, now, tier === 'ULTIMATE' ? 120 : 140, 28, dur, peak);
    this.spawnDarkTurbulence(dest, now, dur * 0.88, tier === 'ULTIMATE' ? 1800 : 1100, 75, peak * 0.85, 1.2);
    if (tier !== 'BASIC') {
      this.spawnElectricalCrackles(dest, now, dur * 0.65, Math.max(0.5, profile.crackleIntensity));
    }
  }

  public playDestruction(kind: DestructionSoundKind, intensity = 1.0): void {
    if (!this.ctx || !this.attacksGain || this.mixer.masterMuted) return;
    const now = this.ctx.currentTime;
    const dest = this.attacksGain;

    if (kind === 'crack') {
      this.spawnElectricalCrackles(dest, now, 0.18, 0.65 * intensity);
      this.spawnSubVibration(dest, now, 110, 48, 0.25, 0.22 * intensity);
    } else if (kind === 'ground') {
      this.spawnSubVibration(dest, now, 95, 26, 1.1, 0.55 * intensity);
      this.spawnDarkTurbulence(dest, now, 0.85, 420, 65, 0.42 * intensity, 1.0);
    } else if (kind === 'statue') {
      this.spawnElectricalCrackles(dest, now, 0.45, 0.9 * intensity);
      this.spawnDarkTurbulence(dest, now, 0.75, 1600, 140, 0.4 * intensity, 1.8);
      this.spawnSubVibration(dest, now + 0.06, 120, 34, 0.75, 0.42 * intensity);
    } else {
      // 'wall' | 'pillar' | 'rock' -> heavy multi-stage stone crash
      const dur = kind === 'wall' || kind === 'pillar' ? 1.35 : 0.95;
      this.spawnSubVibration(dest, now, 105, 28, dur, 0.54 * intensity);
      this.spawnDarkTurbulence(dest, now, dur * 0.9, 680, 70, 0.46 * intensity, 1.1);
      this.spawnElectricalCrackles(dest, now + 0.08, dur * 0.65, 0.78 * intensity);
    }
  }

  public playShieldActivate(profile?: CharacterAudioProfile): void {
    if (!this.ctx || !this.shieldsGain || this.mixer.masterMuted) return;
    const now = this.ctx.currentTime;
    const f = profile?.baseFreq ?? 120;
    this.spawnDarkTurbulence(this.shieldsGain, now, 0.35, 320, 1150, 0.28, 2.2);
    this.spawnSubVibration(this.shieldsGain, now, f, f * 0.5, 0.35, 0.22);
  }

  public setShieldHum(active: boolean, profile?: CharacterAudioProfile): void {
    if (!this.ctx || !this.shieldsGain) return;
    const now = this.ctx.currentTime;

    if (active && !this.mixer.masterMuted) {
      if (!this.shieldIsPlaying) {
        this.playShieldActivate(profile);
      }
      if (!this.shieldOsc1) {
        this.shieldOsc1 = this.ctx.createOscillator();
        this.shieldOsc2 = this.ctx.createOscillator();
        this.shieldLfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        this.shieldHumGain = this.ctx.createGain();

        this.shieldOsc1.type = 'sine';
        this.shieldOsc2.type = 'triangle';
        this.shieldLfo.type = 'sine';
        this.shieldLfo.frequency.value = 6.5;
        lfoGain.gain.value = 14;

        this.shieldLfo.connect(lfoGain);
        lfoGain.connect(this.shieldOsc2.frequency);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 500;
        filter.Q.value = 1.5;

        this.shieldHumGain.gain.value = 0;
        this.shieldOsc1.connect(filter);
        this.shieldOsc2.connect(filter);
        filter.connect(this.shieldHumGain);
        this.shieldHumGain.connect(this.shieldsGain);

        this.shieldOsc1.start();
        this.shieldOsc2.start();
        this.shieldLfo.start();
      }

      const f = profile?.baseFreq ?? 130;
      const ratio = profile?.harmonicRatio ?? 1.5;
      this.shieldOsc1.frequency.setTargetAtTime(f * 1.45, now, 0.08);
      this.shieldOsc2?.frequency.setTargetAtTime(f * 1.45 * ratio, now, 0.08);
      this.shieldHumGain?.gain.setTargetAtTime(0.18, now, 0.06);
      this.shieldIsPlaying = true;
    } else if (this.shieldIsPlaying && this.shieldHumGain) {
      this.shieldHumGain.gain.setTargetAtTime(0, now, 0.08);
      this.shieldIsPlaying = false;
    }
  }

  public playDodge(): void {
    if (!this.ctx || !this.attacksGain || this.mixer.masterMuted) return;
    const now = this.ctx.currentTime;
    this.spawnDarkTurbulence(this.attacksGain, now, 0.25, 1600, 220, 0.28, 1.8);
  }

  public playSpellCollision(): void {
    if (!this.ctx || !this.attacksGain || this.mixer.masterMuted) return;
    const now = this.ctx.currentTime;
    this.spawnSubVibration(this.attacksGain, now, 150, 32, 0.9, 0.5);
    this.spawnDarkTurbulence(this.attacksGain, now, 0.7, 1500, 120, 0.42, 1.4);
    this.spawnElectricalCrackles(this.attacksGain, now, 0.65, 0.95);
  }

  public setClashHum(
    active: boolean,
    balance = 0.5,
    playerProfile?: CharacterAudioProfile,
    opponentProfile?: CharacterAudioProfile
  ): void {
    if (!this.ctx || !this.attacksGain) return;
    const now = this.ctx.currentTime;

    if (active && !this.mixer.masterMuted) {
      if (!this.clashOscP || !this.clashOscO) {
        this.clashOscP = this.ctx.createOscillator();
        this.clashOscO = this.ctx.createOscillator();
        this.clashOscP.type = 'sawtooth';
        this.clashOscO.type = 'sawtooth';

        this.clashFilter = this.ctx.createBiquadFilter();
        this.clashFilter.type = 'bandpass';
        this.clashFilter.frequency.value = 480;
        this.clashFilter.Q.value = 2.4;

        this.clashGain = this.ctx.createGain();
        this.clashGain.gain.value = 0;

        this.clashOscP.connect(this.clashFilter);
        this.clashOscO.connect(this.clashFilter);
        this.clashFilter.connect(this.clashGain);
        this.clashGain.connect(this.attacksGain);

        this.clashOscP.start();
        this.clashOscO.start();
      }

      const pBase = playerProfile?.baseFreq ?? 130;
      const oBase = opponentProfile?.baseFreq ?? 88;
      this.clashOscP.frequency.setTargetAtTime(pBase * (1.3 + balance * 0.65), now, 0.07);
      this.clashOscO.frequency.setTargetAtTime(oBase * (1.3 + (1 - balance) * 0.65), now, 0.07);
      this.clashFilter?.frequency.setTargetAtTime(340 + Math.abs(balance - 0.5) * 900, now, 0.08);
      this.clashGain?.gain.setTargetAtTime(0.28, now, 0.08);

      const nowMs = performance.now();
      if (nowMs - this.clashCrackleTimer > 170) {
        this.clashCrackleTimer = nowMs;
        this.spawnElectricalCrackles(this.attacksGain, now, 0.16, 0.85);
      }
    } else if (this.clashGain) {
      this.clashGain.gain.setTargetAtTime(0, now, 0.08);
    }
  }

  private duckAudioForVoice(durationSec: number): void {
    if (!this.ctx || !this.duckGain) return;
    const now = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(now);
    this.duckGain.gain.setTargetAtTime(0.4, now, 0.05);
    this.duckGain.gain.setTargetAtTime(1.0, now + Math.max(0.6, durationSec), 0.35);
  }

  /**
   * Subtle natural inhale/exhale breathing cue for tense, fearful, or breathy characters
   */
  private playBreathCue(character: CharacterDefinition): void {
    if (!this.ctx || !this.voicesGain || !character.voice.breathingCue) return;
    const intensity = character.voice.breathIntensity;
    if (intensity <= 0.15) return;

    const now = this.ctx.currentTime;
    const dur = character.voice.deliveryStyle === 'sinister_whisper' ? 0.26 : 0.17;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.sin(t * Math.PI);
      const w = Math.random() * 2 - 1;
      lp = lp * 0.7 + w * 0.3;
      data[i] = lp * env;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value =
      character.voice.deliveryStyle === 'sinister_whisper'
        ? 1600
        : character.voice.gender === 'female'
          ? 2100
          : 1350;
    bp.Q.value = 1.8;

    const g = this.ctx.createGain();
    g.gain.value = 0.045 * intensity;

    src.connect(bp);
    bp.connect(g);
    g.connect(this.voicesGain);
    src.start(now);
  }

  private splitIntoExpressivePhrases(line: string): string[] {
    const parts = line
      .split(/\s*(?:\.\.\.|—|\.|\!|\?)\s*/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return parts.length > 0 ? parts : [line];
  }

  private cancelPendingVoice(): void {
    if (this.pendingVoiceTimer !== null) {
      clearTimeout(this.pendingVoiceTimer);
      this.pendingVoiceTimer = null;
    }
    if (this.followUpVoiceTimer !== null) {
      clearTimeout(this.followUpVoiceTimer);
      this.followUpVoiceTimer = null;
    }
    if (this.currentVoiceSource) {
      try {
        this.currentVoiceSource.stop();
      } catch {
        // ignore if already stopped
      }
      this.currentVoiceSource = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  }

  public cancelMatchDialogue(): void {
    this.voiceSessionId++;
    this.cancelPendingVoice();
  }

  private selectGenderAccurateVoice(
    character: CharacterDefinition,
    voices: SpeechSynthesisVoice[]
  ): { voice: SpeechSynthesisVoice | null; genderMatched: boolean } {
    if (voices.length === 0) {
      return { voice: null, genderMatched: true };
    }

    const v = character.voice;
    const femaleRx =
      /\b(female|woman|zira|hazel|libby|sonia|susan|kate|samantha|victoria|serena|aria|jenny|emma|claire|linda|amy|joanna|kendra|kimberly|salli|ivy|raveena|tessa|fiona|moira|karen|catherine|natasha|olivia|maisie)\b/i;
    const maleRx =
      /\b(male|man|david|mark|george|daniel|ryan|arthur|oliver|alex|guy|christopher|thomas|richard|james|william|brian|eric|jacob|paul|stephen|alfie|elliot|liam|connor)\b/i;

    const british = voices.filter((vc) => /en-GB/i.test(vc.lang));
    const english = voices.filter((vc) => /^en/i.test(vc.lang));
    const baseList = english.length > 0 ? english : voices;

    const hash = character.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

    if (v.gender === 'female') {
      const gbFemale = british.filter((vc) => femaleRx.test(vc.name));
      const enFemale = baseList.filter((vc) => femaleRx.test(vc.name));
      const nonMale = baseList.filter((vc) => !maleRx.test(vc.name));
      const pool = gbFemale.length > 0 ? gbFemale : enFemale.length > 0 ? enFemale : nonMale;
      if (pool.length === 0) {
        return { voice: null, genderMatched: false };
      }
      return { voice: pool[hash % pool.length], genderMatched: true };
    }

    const gbMale = british.filter((vc) => maleRx.test(vc.name));
    const enMale = baseList.filter((vc) => maleRx.test(vc.name));
    const nonFemale = baseList.filter((vc) => !femaleRx.test(vc.name));
    const pool = gbMale.length > 0 ? gbMale : enMale.length > 0 ? enMale : nonFemale;
    if (pool.length === 0) {
      return { voice: null, genderMatched: false };
    }
    return { voice: pool[hash % pool.length], genderMatched: true };
  }

  private playSingleCharacterLine(
    character: CharacterDefinition,
    outcome: 'VICTORY' | 'DEFEAT',
    lineText: string,
    sessionId: number,
    onDone?: () => void
  ): void {
    if (
      sessionId !== this.voiceSessionId ||
      this.mixer.masterMuted ||
      !this.mixer.voicesEnabled ||
      this.mixer.voicesVolume <= 0.02
    ) {
      return;
    }

    const v = character.voice;
    const clipKey = `${character.id}:${outcome === 'VICTORY' ? 'victory' : 'defeat'}`;

    // 1. Studio Voice Acting Asset (preloaded from /public/voices/ or uploaded in Settings)
    if (this.ctx && this.voicesGain) {
      const clip = this.customVoiceClips.get(clipKey);
      if (clip) {
        const durSec = Math.max(0.6, clip.duration);
        this.duckAudioForVoice(Math.min(5.0, durSec));

        const src = this.ctx.createBufferSource();
        src.buffer = clip;

        const eq = this.ctx.createBiquadFilter();
        eq.type = 'peaking';
        eq.frequency.value = v.presenceEqHz;
        eq.Q.value = 1.2;
        eq.gain.value = v.presenceGainDb;

        src.connect(eq);
        eq.connect(this.voicesGain);

        if (this.reverbNode && v.reverbWet > 0.02) {
          const wetGain = this.ctx.createGain();
          wetGain.gain.value = v.reverbWet * this.mixer.voicesVolume;
          eq.connect(wetGain);
          wetGain.connect(this.reverbNode);
        }

        if (this.currentVoiceSource) {
          try {
            this.currentVoiceSource.stop();
          } catch {
            // ignore
          }
        }
        this.currentVoiceSource = src;
        src.onended = () => {
          if (this.currentVoiceSource === src) {
            this.currentVoiceSource = null;
          }
          if (sessionId === this.voiceSessionId && onDone) {
            onDone();
          }
        };
        src.start(this.ctx.currentTime);
        return;
      }
    }

    // Studio recording missing for this character + outcome
    if (!this.missingWarned.has(clipKey)) {
      this.missingWarned.add(clipKey);
      console.info(
        `[AudioManager] Studio ${outcome.toLowerCase()} voice asset missing for ${character.name} (/voices/${character.id}_${outcome.toLowerCase()}.mp3).`
      );
    }

    if (!this.mixer.ttsFallbackEnabled) {
      if (onDone) onDone();
      return;
    }

    // 2. Expressive Gender-Accurate Browser SpeechSynthesis Preview Fallback
    this.playBreathCue(character);

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        const synth = window.speechSynthesis;
        synth.cancel();

        const voices = synth.getVoices();
        const selection = this.selectGenderAccurateVoice(character, voices);
        if (!selection.genderMatched) {
          console.info(
            `[AudioManager] Skipped SpeechSynthesis fallback for ${character.name} to avoid mismatched voice gender.`
          );
          if (onDone) onDone();
          return;
        }

        const phrases = this.splitIntoExpressivePhrases(lineText);
        const estDurSec = Math.max(1.8, Math.min(4.8, lineText.length * 0.064));
        this.duckAudioForVoice(estDurSec);

        let completedCount = 0;
        let finished = false;
        const finishSafely = () => {
          if (finished) return;
          finished = true;
          if (sessionId === this.voiceSessionId && onDone) {
            onDone();
          }
        };

        // Safety timer in case browser SpeechSynthesis fails to fire onend
        this.followUpVoiceTimer = window.setTimeout(finishSafely, estDurSec * 1000 + 700);

        phrases.forEach((phrase, idx) => {
          const utter = new SpeechSynthesisUtterance(phrase);
          if (selection.voice) utter.voice = selection.voice;

          let pShift = 0;
          let rShift = 0;
          if (outcome === 'DEFEAT') {
            if (v.deliveryStyle === 'unhinged') {
              pShift = idx === phrases.length - 1 ? 0.14 : 0.06;
              rShift = 0.05;
            } else if (v.deliveryStyle === 'sinister_whisper' || v.deliveryStyle === 'cold_restrained') {
              pShift = -0.03;
              rShift = -0.05;
            } else {
              pShift = idx === phrases.length - 1 ? -0.05 : -0.02;
              rShift = -0.05;
            }
          } else {
            if (v.deliveryStyle === 'courageous_tense' || v.deliveryStyle === 'timid_heroic' || v.deliveryStyle === 'nervous_brave') {
              pShift = idx === 0 ? -0.02 : 0.06;
              rShift = idx === 0 ? -0.04 : 0.05;
            } else if (v.deliveryStyle === 'unhinged') {
              pShift = idx === phrases.length - 1 ? 0.14 : 0.02;
              rShift = 0.07;
            } else if (v.deliveryStyle === 'fierce') {
              pShift = 0.05;
              rShift = 0.04;
            }
          }

          const minPitch = v.gender === 'female' ? 1.0 : 0.55;
          const maxPitch = v.gender === 'female' ? 1.48 : 1.52;
          utter.pitch = Math.max(minPitch, Math.min(maxPitch, v.pitch + pShift));
          utter.rate = Math.max(0.72, Math.min(1.22, v.rate + rShift));
          utter.volume = Math.min(1, this.mixer.voicesVolume * this.mixer.masterVolume);

          utter.onend = () => {
            completedCount++;
            if (completedCount >= phrases.length) {
              if (this.followUpVoiceTimer !== null) {
                clearTimeout(this.followUpVoiceTimer);
                this.followUpVoiceTimer = null;
              }
              finishSafely();
            }
          };
          utter.onerror = () => {
            completedCount++;
            if (completedCount >= phrases.length) {
              if (this.followUpVoiceTimer !== null) {
                clearTimeout(this.followUpVoiceTimer);
                this.followUpVoiceTimer = null;
              }
              finishSafely();
            }
          };

          synth.speak(utter);
        });
      } catch {
        if (onDone) onDone();
      }
    } else if (onDone) {
      onDone();
    }
  }

  /**
   * POST-MATCH ONLY CHARACTER VOICE SYSTEM:
   * - Plays ONLY after the match finishes (VICTORY or DEFEAT).
   * - Synchronized with the victory/defeat animation (~240ms after transition).
   * - In team battles, plays the player's line first, then optionally one teammate sequentially (never overlapping).
   */
  public playPostMatchDialogue(
    playerChar: CharacterDefinition,
    outcome: 'VICTORY' | 'DEFEAT',
    teammateChar?: CharacterDefinition | null,
    onSubtitle?: (speaker: string, text: string, color: string) => void
  ): void {
    this.cancelMatchDialogue();
    const sessionId = this.voiceSessionId;

    const primaryLine =
      outcome === 'VICTORY' ? playerChar.voice.victoryLine : playerChar.voice.defeatLine;
    const primaryColor =
      outcome === 'VICTORY' ? playerChar.spells.ultimate.primaryColor : '#fca5a5';

    onSubtitle?.(playerChar.name, primaryLine, primaryColor);

    if (
      this.mixer.masterMuted ||
      !this.mixer.voicesEnabled ||
      this.mixer.voicesVolume <= 0.02
    ) {
      return;
    }

    this.pendingVoiceTimer = window.setTimeout(() => {
      this.pendingVoiceTimer = null;
      if (sessionId !== this.voiceSessionId) return;

      this.playSingleCharacterLine(playerChar, outcome, primaryLine, sessionId, () => {
        if (!teammateChar || teammateChar.id === playerChar.id) return;
        if (sessionId !== this.voiceSessionId) return;

        this.pendingVoiceTimer = window.setTimeout(() => {
          this.pendingVoiceTimer = null;
          if (sessionId !== this.voiceSessionId) return;
          const mateLine =
            outcome === 'VICTORY'
              ? teammateChar.voice.teamVictoryLine
              : teammateChar.voice.teamDefeatLine;
          const mateColor =
            outcome === 'VICTORY'
              ? teammateChar.spells.ultimate.primaryColor
              : '#fda4af';
          onSubtitle?.(teammateChar.name, mateLine, mateColor);
          this.playSingleCharacterLine(teammateChar, outcome, mateLine, sessionId);
        }, 380);
      });
    }, 240);
  }

  /**
   * Settings audition preview for testing any character's Victory or Defeat dialogue individually.
   */
  public previewPostMatchVoice(
    character: CharacterDefinition,
    outcome: 'VICTORY' | 'DEFEAT'
  ): void {
    this.cancelMatchDialogue();
    const sessionId = this.voiceSessionId;
    const line =
      outcome === 'VICTORY' ? character.voice.victoryLine : character.voice.defeatLine;
    this.playSingleCharacterLine(character, outcome, line, sessionId);
  }

  public dispose(): void {
    try {
      this.cancelMatchDialogue();
      if (this.musicTimer !== null) clearInterval(this.musicTimer);
      this.rainSource?.stop();
      this.musicOscs.forEach((o) => o.stop());
      this.shieldOsc1?.stop();
      this.shieldOsc2?.stop();
      this.shieldLfo?.stop();
      this.clashOscP?.stop();
      this.clashOscO?.stop();
      void this.ctx?.close();
    } catch {
      // ignore
    }
  }
}
