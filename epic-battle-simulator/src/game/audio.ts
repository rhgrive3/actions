/* Procedural WebAudio sound effects & war drum cadence. No external assets.
   Every impact sound is layered (sub punch + mid body + transient + metallic modal ring)
   and pitched with deterministic-ish jitter so repeated hits never sound like a single
   repeating beep. Sounds pan with their screen position, a filtered stereo delay tail
   sells the open battlefield, and a master highpass + DynamicsCompressor limiter prevents
   clipping or voice saturation during 100-unit melees. */

export type SfxName =
  | "click" | "select" | "deploy" | "land" | "tab"
  | "swing" | "hit" | "block" | "arrow" | "quarrel" | "bolt" | "lightning"
  | "bomb" | "boom" | "pistol" | "rail" | "heal"
  | "death" | "charge" | "horn" | "error" | "win" | "lose";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Maximum simultaneous synthesized voices before non-essential layers are shed. */
const MAX_VOICES = 44;

export class AudioFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private subCut: BiquadFilterNode | null = null;
  private bus: GainNode | null = null;
  private delay: DelayNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private pinkBuf: AudioBuffer | null = null;
  private driveCurve: Float32Array<ArrayBuffer> | null = null;
  private last: Record<string, number> = {};
  private hitStamps: number[] = [];
  private activeVoices = 0;
  private seed = 1;
  private drumTimer: number | null = null;
  private drumStep = 0;
  muted = false;
  bgmOn = true;

  init() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }

      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.34;
      this.master.connect(this.ctx.destination);

      // Master brickwall limiter / compressor + sub-sonic highpass to prevent clipping in massive melees.
      this.subCut = this.ctx.createBiquadFilter();
      this.subCut.type = "highpass";
      this.subCut.frequency.value = 28;
      this.subCut.Q.value = 0.707;

      if (typeof this.ctx.createDynamicsCompressor === "function") {
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -9;
        this.compressor.knee.value = 6;
        this.compressor.ratio.value = 14;
        this.compressor.attack.value = 0.002;
        this.compressor.release.value = 0.14;
        this.subCut.connect(this.compressor);
        this.compressor.connect(this.master);
      } else {
        this.subCut.connect(this.master);
      }

      // Main dry/wet bus feeding an open-air filtered battlefield slapback tail.
      this.bus = this.ctx.createGain();
      this.bus.gain.value = 0.92;
      this.delay = this.ctx.createDelay(0.5);
      this.delay.delayTime.value = 0.125;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.24;
      const tone = this.ctx.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.value = 2100;
      const airCut = this.ctx.createBiquadFilter();
      airCut.type = "highpass";
      airCut.frequency.value = 140;
      const send = this.ctx.createGain();
      send.gain.value = 0.22;

      this.bus.connect(this.subCut);
      this.bus.connect(send);
      send.connect(this.delay);
      this.delay.connect(airCut);
      airCut.connect(tone);
      tone.connect(fb);
      fb.connect(this.delay);
      tone.connect(this.subCut);

      // Pre-compute both crisp white noise and warm pink/brown noise buffers (zero external assets).
      const len = Math.floor(this.ctx.sampleRate * 2);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      this.pinkBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const white = this.noiseBuf.getChannelData(0);
      const pink = this.pinkBuf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        white[i] = w;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        pink[i] = clamp((b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.18, -1, 1);
        b6 = w * 0.115926;
      }

      // Soft-clipping waveshaper curve for warm analog-style impact transient saturation.
      const curveLen = 256;
      this.driveCurve = new Float32Array(new ArrayBuffer(curveLen * 4));
      for (let i = 0; i < curveLen; i++) {
        const x = (i * 2) / (curveLen - 1) - 1;
        this.driveCurve[i] = Math.tanh(x * 2.2);
      }
    }
    this.resumeIfNeeded();
  }

  private resumeIfNeeded() {
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        void this.ctx.resume().catch(() => {});
      } catch {
        /* ignore autoplay restrictions until user gesture */
      }
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setValueAtTime(this.muted ? 0 : 0.34, this.ctx.currentTime);
    } else if (this.master) {
      this.master.gain.value = this.muted ? 0 : 0.34;
    }
    return this.muted;
  }

  /**
   * Starts or stops the procedural polyrhythmic war-drum & low-brass cadence during active combat.
   * Uses a 16-step (145ms subdivision) 2-bar cycle combining 3+3+2 Taiko downbeats,
   * syncopated pitched Timpani counter-rhythms, stereo rim/clack ghost notes, and dark brass swells.
   */
  setWarDrums(active: boolean) {
    if (!active || !this.bgmOn) {
      if (this.drumTimer !== null) {
        window.clearInterval(this.drumTimer);
        this.drumTimer = null;
      }
      return;
    }
    if (this.drumTimer !== null) return;
    this.drumStep = 0;
    this.drumTimer = window.setInterval(() => {
      if (!this.ctx || this.muted || !this.bgmOn) return;
      if (this.ctx.state === "suspended") return;
      if (this.activeVoices >= MAX_VOICES - 6) return;

      const tick = this.drumStep++;
      const step = tick % 16;
      const bar = Math.floor(tick / 16) % 2;

      // 1. Primary Taiko / Gran Cassa 3+3+2 polyrhythmic pulse (steps 0, 3, 6, 8, 12, plus bar-2 turnaround on 14)
      const taikoWeights: Record<number, number> = {
        0: 1.0,
        3: 0.62,
        6: 0.85,
        8: 0.78,
        12: 0.9,
      };
      const wTaiko = taikoWeights[step] ?? (bar === 1 && step === 14 ? 0.72 : 0);
      if (wTaiko > 0) {
        const pan = step === 0 ? 0 : (step % 2 === 0 ? -0.18 : 0.18);
        const fBase = step === 0 ? 78 : step === 6 ? 72 : 82;
        this.punch(fBase, 34, 0.032, 0.28, 0.082 * wTaiko, 0, pan);
        this.tone("triangle", fBase * 1.5, 48, 0.19, 0.036 * wTaiko, 0.003, pan);
        this.noise(0.11, "lowpass", 310, 75, 0.038 * wTaiko, 0, pan, 1.1, true);
      }

      // 2. Syncopated Pitched Timpani counter-rhythm (interlocking with Taiko on steps 2, 5, 10, 11, 15)
      if (step === 2 || step === 5 || step === 10 || (bar === 1 && (step === 11 || step === 15))) {
        const timpPitch =
          step === 10 ? (bar === 0 ? 82.41 : 87.31) // E2 / F2 tension
          : step === 5 ? 73.42                       // D2 sub-fourth
          : 55.0;                                    // A1 pedal
        const vel = step === 10 ? 0.68 : 0.48;
        const pan = step % 2 === 0 ? 0.26 : -0.26;
        this.tone("sine", timpPitch * 1.18, timpPitch, 0.24, 0.052 * vel, 0, pan);
        this.tone("triangle", timpPitch * 2.0, timpPitch * 1.98, 0.16, 0.022 * vel, 0.004, pan);
      }

      // 3. Martial Rim-Clack & Armor-March Ghost Notes (16th-note propulsion)
      if (step === 4 || step === 7 || step === 9 || step === 13 || step === 15) {
        const rimAccent = step === 4 || step === 13 ? 0.75 : 0.42;
        const pan = ((step * 37) % 7 - 3) * 0.11;
        this.noise(0.048, "bandpass", 1680, 760, 0.022 * rimAccent, 0, pan, 3.4, false);
        if (step === 4 || step === 13) {
          this.ring(2850, 0.045, 0.012 * rimAccent, 0.003, -pan, 9);
        }
      }

      // 4. Cinematic Low-Brass & War-Horn Tension Swell at the start of each 2-bar phrase
      if (step === 0) {
        const root = bar === 0 ? 55.0 : 58.27;     // A1 -> Bb1 Phrygian dark shift
        const fifth = bar === 0 ? 82.41 : 87.31;   // E2 -> F2
        this.filteredTone("sawtooth", root, root * 0.995, 1.45, 0.018, "lowpass", 340, 190, 0.02, -0.12);
        this.filteredTone("triangle", fifth, fifth * 1.002, 1.35, 0.015, "lowpass", 460, 240, 0.06, 0.12);
      }
    }, 145);
  }

  dispose() {
    this.setWarDrums(false);
    this.bus?.disconnect();
    this.subCut?.disconnect();
    this.compressor?.disconnect();
    this.master?.disconnect();
    this.delay?.disconnect();
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.close().catch(() => {});
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.subCut = null;
    this.bus = null;
    this.delay = null;
    this.noiseBuf = null;
    this.pinkBuf = null;
    this.driveCurve = null;
    this.last = {};
    this.hitStamps = [];
    this.activeVoices = 0;
  }

  private throttled(name: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.last[name] || 0) < ms) return true;
    this.last[name] = now;
    return false;
  }

  /** Dynamic combat density scaling so simultaneous impacts never muddy the mid-range. */
  private impactScale(): number {
    const now = performance.now();
    while (this.hitStamps.length > 0 && now - this.hitStamps[0] > 180) {
      this.hitStamps.shift();
    }
    this.hitStamps.push(now);
    const n = this.hitStamps.length;
    return 1 / (1 + Math.max(0, n - 1) * 0.11);
  }

  /** Deterministic-ish jitter so every swing and every hit differs slightly. */
  private jitter(spread = 0.12) {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    const r = this.seed / 4294967296;
    return 1 + (r * 2 - 1) * spread;
  }

  /** Connects a voice to the master bus with optional stereo panning and automatic cleanup. */
  private connectOut(node: AudioNode, pan: number): AudioNode {
    const ctx = this.ctx!;
    if (Math.abs(pan) < 0.02 || typeof ctx.createStereoPanner !== "function") {
      node.connect(this.bus!);
      return node;
    }
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    node.connect(p);
    p.connect(this.bus!);
    return p;
  }

  /**
   * Percussive two-stage pitch envelope: drops rapidly from attack pitch `fAttack` to body
   * pitch `fBody` in `dropTime` seconds, then settles to `fBody * 0.72` over `dur`.
   * Eliminates the synthetic "cartoon laser/beep" sweep of linear-in-log full-duration ramps.
   */
  private punch(
    fAttack: number,
    fBody: number,
    dropTime: number,
    dur: number,
    gain: number,
    delay = 0,
    pan = 0,
    saturate = false,
  ) {
    if (!this.ctx || !this.master || this.muted || this.activeVoices >= MAX_VOICES) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    const fA = Math.max(24, fAttack);
    const fB = Math.max(22, fBody);
    const tDrop = t0 + Math.min(dropTime, dur * 0.45);
    o.frequency.setValueAtTime(fA, t0);
    o.frequency.exponentialRampToValueAtTime(fB, tDrop);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, fB * 0.74), t0 + dur);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(0.0035, dur * 0.12));
    g.gain.exponentialRampToValueAtTime(Math.max(0.00015, gain * 0.38), tDrop);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    let tail: AudioNode = g;
    let shaper: WaveShaperNode | null = null;
    if (saturate && this.driveCurve && typeof this.ctx.createWaveShaper === "function") {
      shaper = this.ctx.createWaveShaper();
      shaper.curve = this.driveCurve;
      o.connect(shaper);
      shaper.connect(g);
    } else {
      o.connect(g);
    }
    const routed = this.connectOut(tail, pan);
    this.activeVoices++;
    o.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      o.disconnect();
      shaper?.disconnect();
      g.disconnect();
      if (routed !== g) routed.disconnect();
    };
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    gain: number,
    delay = 0,
    pan = 0,
    attack = 0.008,
  ) {
    if (!this.ctx || !this.master || this.muted || this.activeVoices >= MAX_VOICES) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(attack, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    const routed = this.connectOut(g, pan);
    this.activeVoices++;
    o.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      o.disconnect();
      g.disconnect();
      if (routed !== g) routed.disconnect();
    };
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  /** Oscillator routed through a dedicated BiquadFilter for warm brass, wood, and sci-fi timbres. */
  private filteredTone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    gain: number,
    filterType: BiquadFilterType,
    cut0: number,
    cut1: number,
    delay = 0,
    pan = 0,
    q = 1.4,
    attack = 0.012,
  ) {
    if (!this.ctx || !this.master || this.muted || this.activeVoices >= MAX_VOICES) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    f.type = filterType;
    f.frequency.setValueAtTime(Math.max(40, cut0), t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, cut1), t0 + dur);
    f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(attack, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(f);
    f.connect(g);
    const routed = this.connectOut(g, pan);
    this.activeVoices++;
    o.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      o.disconnect();
      f.disconnect();
      g.disconnect();
      if (routed !== g) routed.disconnect();
    };
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noise(
    dur: number,
    type: BiquadFilterType,
    f0: number,
    f1: number,
    gain: number,
    delay = 0,
    pan = 0,
    q = 1.1,
    warmPink = false,
    attack = 0.006,
  ) {
    const buf = warmPink ? (this.pinkBuf ?? this.noiseBuf) : this.noiseBuf;
    if (!this.ctx || !this.master || !buf || this.muted || this.activeVoices >= MAX_VOICES) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = 0.78 + this.jitter(0.22) * 0.22;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(Math.max(40, f0), t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(attack, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    const routed = this.connectOut(g, pan);
    this.activeVoices++;
    src.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      src.disconnect();
      f.disconnect();
      g.disconnect();
      if (routed !== g) routed.disconnect();
    };
    const maxOffset = Math.max(0, buf.duration - dur - 0.05);
    const offset = maxOffset > 0 ? ((this.seed & 1023) / 1024) * maxOffset : 0;
    src.start(t0, offset);
    src.stop(t0 + dur + 0.02);
  }

  /** Metallic modal resonance: combined high-Q filtered noise + faint inharmonic overtone chime. */
  private ring(freq: number, dur: number, gain: number, delay = 0, pan = 0, q = 9) {
    this.noise(dur, "bandpass", freq, freq * 0.82, gain, delay, pan, q, false, 0.003);
    if (this.activeVoices < MAX_VOICES - 8) {
      this.tone("sine", freq * 1.005, freq * 0.99, dur * 0.85, gain * 0.35, delay, pan, 0.002);
    }
  }

  sfx(name: SfxName, pan = 0) {
    if (!this.ctx || this.muted) return;
    this.resumeIfNeeded();
    switch (name) {
      case "click": {
        const det = this.jitter(0.05);
        this.punch(520 * det, 180, 0.012, 0.038, 0.055, 0, pan);
        this.noise(0.024, "bandpass", 2400 * det, 1200, 0.035, 0, pan, 3.2, false, 0.002);
        break;
      }
      case "select": {
        const det = this.jitter(0.04);
        this.tone("triangle", 520 * det, 660 * det, 0.065, 0.055, 0, pan, 0.004);
        this.tone("sine", 780 * det, 1040 * det, 0.08, 0.045, 0.022, pan, 0.004);
        break;
      }
      case "deploy": {
        if (this.throttled(name, 95)) return;
        const det = this.jitter(0.1);
        // Boot/halberd ground plant + armor harness settle
        this.punch(145 * det, 46, 0.025, 0.16, 0.18, 0, pan, true);
        this.noise(0.14, "lowpass", 680 * det, 180, 0.14, 0, pan, 1.1, true, 0.005);
        this.ring(1920 * det, 0.09, 0.035, 0.025, pan, 8);
        this.ring(2860 * det, 0.07, 0.022, 0.04, pan, 10);
        break;
      }
      case "land": {
        if (this.throttled(name, 55)) return;
        const det = this.jitter(0.12);
        this.punch(138 * det, 42, 0.028, 0.19, 0.25, 0, pan, true);
        this.noise(0.15, "lowpass", 740 * det, 120, 0.15, 0, pan, 0.9, true, 0.004);
        this.ring(1680 * det, 0.06, 0.022, 0.018, pan, 7);
        break;
      }
      case "tab": {
        this.tone("triangle", 440, 660, 0.065, 0.055, 0, pan, 0.004);
        this.noise(0.03, "bandpass", 1800, 2600, 0.025, 0, pan, 2.5, true, 0.003);
        break;
      }
      case "swing": {
        if (this.throttled(name, 65)) return;
        const det = this.jitter(0.18);
        const scale = this.impactScale();
        // Weighty air-displacement whoosh using warm pink noise + subtle steel air-cut
        this.noise(0.16, "bandpass", 980 * det, 260, 0.13 * scale, 0, pan, 1.5, true, 0.018);
        this.noise(0.11, "lowpass", 420 * det, 120, 0.075 * scale, 0.01, pan, 1.1, true, 0.015);
        this.noise(0.055, "bandpass", 2950 * det, 1350, 0.024 * scale, 0.045, pan, 5.5, false, 0.006);
        break;
      }
      case "hit": {
        if (this.throttled(name, 52)) return;
        const det = this.jitter(0.18);
        const scale = this.impactScale();
        // 1. Tight sub-bass punch (fast 24ms pitch drop avoids muddy low-end boom or cartoon beep)
        this.punch(152 * det, 52 * det, 0.024, 0.125, 0.24 * scale, 0, pan, true);
        // 2. Warm mid-range body thud (flesh / leather / wooden shaft resonance)
        this.filteredTone("triangle", 260 * det, 92 * det, 0.085, 0.11 * scale, "lowpass", 720, 210, 0, pan, 1.4, 0.003);
        this.noise(0.085, "bandpass", 680 * det, 220, 0.15 * scale, 0, pan, 1.35, true, 0.003);
        // 3. Crisp impact crack + balanced dual-mode armor clink (pleasant on rapid consecutive hits)
        this.noise(0.032, "bandpass", 2150 * det, 880, 0.085 * scale, 0, pan, 2.2, false, 0.002);
        this.ring(2380 * det, 0.075, 0.032 * scale, 0.008, pan, 10);
        this.ring(3520 * det, 0.055, 0.018 * scale, 0.014, pan, 12);
        break;
      }
      case "block": {
        if (this.throttled(name, 48)) return;
        const det = this.jitter(0.16);
        const scale = this.impactScale();
        // 1. Solid oak/iron shield body knock
        this.punch(165 * det, 64, 0.02, 0.11, 0.2 * scale, 0, pan, true);
        this.noise(0.075, "lowpass", 620 * det, 170, 0.12 * scale, 0, pan, 1.4, true, 0.002);
        // 2. Inharmonic steel-on-steel deflection clang (ratios 1 : 1.54 : 2.18)
        const base = 1140 * det;
        this.ring(base, 0.11, 0.075 * scale, 0, pan, 14);
        this.ring(base * 1.54, 0.095, 0.065 * scale, 0.003, pan, 16);
        this.ring(base * 2.18, 0.075, 0.045 * scale, 0.006, pan, 18);
        this.noise(0.05, "bandpass", 4200 * det, 2100, 0.08 * scale, 0, pan, 4.5, false, 0.002);
        break;
      }
      case "arrow": {
        if (this.throttled(name, 85)) return;
        const det = this.jitter(0.14);
        // Taut bowstring pluck (fundamental + octave harmonic) + feathered shaft air-zip
        this.filteredTone("triangle", 215 * det, 118 * det, 0.085, 0.085, "bandpass", 520, 240, 0, pan, 2.2, 0.002);
        this.tone("sine", 430 * det, 235 * det, 0.065, 0.045, 0.002, pan, 0.002);
        this.noise(0.075, "bandpass", 3100 * det, 1050, 0.095, 0.006, pan, 3.8, false, 0.004);
        break;
      }
      case "quarrel": {
        if (this.throttled(name, 85)) return;
        const det = this.jitter(0.12);
        // 1. Mechanical iron trigger sear latch click
        this.noise(0.022, "bandpass", 3800 * det, 2100, 0.11, 0, pan, 6.5, false, 0.001);
        this.tone("square", 980 * det, 420, 0.02, 0.045, 0, pan, 0.001);
        // 2. Heavy steel prod snap + high-velocity bolt whoosh
        this.punch(280 * det, 92, 0.018, 0.09, 0.14, 0.012, pan, true);
        this.ring(1560 * det, 0.075, 0.05, 0.012, pan, 10);
        this.noise(0.09, "bandpass", 2200 * det, 620, 0.13, 0.014, pan, 2.8, true, 0.003);
        break;
      }
      case "bolt": {
        if (this.throttled(name, 100)) return;
        const det = this.jitter(0.14);
        // Arcane / lightning orb discharge: plasma crackle + resonant harmonic sweep + sub thunder
        this.punch(140 * det, 44, 0.028, 0.2, 0.16, 0, pan);
        this.filteredTone("sawtooth", 1120 * det, 240, 0.17, 0.085, "bandpass", 1800, 420, 0, pan, 2.4, 0.003);
        this.tone("triangle", 1680 * det, 390, 0.14, 0.06, 0.008, pan, 0.003);
        this.noise(0.15, "bandpass", 3400 * det, 1200, 0.09, 0, pan, 2.2, false, 0.002);
        break;
      }
      case "lightning": {
        if (this.throttled(name, 75)) return;
        const det = this.jitter(0.16);
        // Zeus chain-lightning: multi-arc high-voltage snap + sky-splitting thunderclap
        this.punch(165 * det, 36, 0.025, 0.34, 0.26, 0, pan, true);
        this.noise(0.045, "highpass", 3800 * det, 1800, 0.14, 0, pan, 1.8, false, 0.001);
        this.noise(0.055, "bandpass", 4600 * det, 1500, 0.12, 0.028, pan, 2.6, false, 0.001);
        this.filteredTone("sawtooth", 2100 * det, 170, 0.18, 0.11, "bandpass", 2600, 380, 0.005, pan, 2.8, 0.002);
        this.noise(0.32, "lowpass", 920 * det, 75, 0.18, 0.015, pan, 1.2, true, 0.008);
        break;
      }
      case "bomb": {
        if (this.throttled(name, 120)) return;
        const det = this.jitter(0.12);
        // Mortar/bomb lob thump + burning black-powder fuse sizzle
        this.punch(165 * det, 62, 0.024, 0.15, 0.15, 0, pan);
        this.noise(0.11, "bandpass", 2800 * det, 1600, 0.065, 0.01, pan, 3.6, false, 0.005);
        this.tone("sine", 260 * det, 420 * det, 0.13, 0.05, 0.01, pan, 0.01);
        break;
      }
      case "boom": {
        if (this.throttled(name, 85)) return;
        const det = this.jitter(0.14);
        // Heavy cannon / bomb detonation: transient blast crack + chest-thumping sub + rolling fire rumble
        this.punch(145 * det, 29, 0.038, 0.54, 0.38, 0, pan, true);
        this.filteredTone("sawtooth", 195 * det, 34, 0.36, 0.18, "lowpass", 520, 68, 0.004, pan, 1.3, 0.003);
        this.noise(0.075, "bandpass", 2600 * det, 580, 0.22, 0, pan, 1.6, false, 0.002);
        this.noise(0.52, "lowpass", 1450 * det, 62, 0.28, 0.012, pan, 1.05, true, 0.008);
        this.noise(0.22, "bandpass", 3400 * det, 820, 0.09, 0.035, pan, 2.8, false, 0.006);
        break;
      }
      case "pistol": {
        if (this.throttled(name, 58)) return;
        const det = this.jitter(0.12);
        // Matchlock flint ignition flash + sharp black-powder muzzle crack + barrel ring
        this.noise(0.018, "highpass", 4200 * det, 2600, 0.09, 0, pan, 1.4, false, 0.001);
        this.punch(320 * det, 58, 0.016, 0.11, 0.22, 0.008, pan, true);
        this.noise(0.11, "bandpass", 2450 * det, 540, 0.22, 0.008, pan, 1.7, false, 0.002);
        this.noise(0.16, "lowpass", 780 * det, 110, 0.14, 0.015, pan, 1.0, true, 0.005);
        this.ring(2150 * det, 0.075, 0.038, 0.012, pan, 9);
        break;
      }
      case "rail": {
        if (this.throttled(name, 80)) return;
        const det = this.jitter(0.1);
        // 1. Rapid magnetic capacitor charge-up whine (0 - 55ms)
        this.filteredTone("sine", 420 * det, 2600 * det, 0.058, 0.11, "bandpass", 800, 2800, 0, pan, 3.0, 0.008);
        this.tone("sawtooth", 210 * det, 1300 * det, 0.055, 0.065, 0, pan, 0.008);
        // 2. Hyper-velocity electromagnetic discharge whip + sub recoil + ionized plasma crackle (50ms)
        this.punch(240 * det, 36, 0.028, 0.32, 0.28, 0.048, pan, true);
        this.filteredTone("sawtooth", 2900 * det, 115, 0.26, 0.16, "bandpass", 3600, 260, 0.048, pan, 2.6, 0.002);
        this.noise(0.22, "bandpass", 4800 * det, 1100, 0.14, 0.048, pan, 2.4, false, 0.002);
        this.ring(3300 * det, 0.18, 0.045, 0.055, pan, 12);
        break;
      }
      case "heal": {
        if (this.throttled(name, 165)) return;
        // Sacred D-Lydian / Major 9th celestial chord with warm pad + angelic bell overtones
        this.tone("triangle", 293.66, 294.2, 0.52, 0.042, 0, pan, 0.035);
        this.tone("sine", 440.0, 440.8, 0.5, 0.038, 0.02, pan, 0.035);
        const notes = [587.33, 739.99, 880.0, 1108.73, 1318.51];
        notes.forEach((f, i) => {
          const d = i * 0.042;
          const p = clamp(pan + (i - 2) * 0.08, -1, 1);
          this.tone("sine", f, f * 1.004, 0.42, 0.048, d, p, 0.022);
          this.tone("triangle", f * 2, f * 2.006, 0.28, 0.016, d + 0.008, p, 0.015);
        });
        this.noise(0.36, "bandpass", 3800, 5800, 0.018, 0.04, pan, 5.5, false, 0.04);
        break;
      }
      case "death": {
        if (this.throttled(name, 140)) return;
        const det = this.jitter(0.18);
        // Heavy armor collapse + low body thud (no harsh buzzing sawtooth)
        this.punch(128 * det, 38, 0.035, 0.28, 0.22, 0, pan, true);
        this.filteredTone("sawtooth", 145 * det, 52, 0.26, 0.09, "lowpass", 420, 95, 0, pan, 1.5, 0.008);
        this.noise(0.24, "lowpass", 640 * det, 85, 0.16, 0.01, pan, 1.2, true, 0.006);
        this.ring(1850 * det, 0.11, 0.035, 0.03, pan, 8);
        break;
      }
      case "charge": {
        if (this.throttled(name, 190)) return;
        const det = this.jitter(0.12);
        // Thundering cavalry impact / ground tremor
        this.punch(112 * det, 30, 0.035, 0.36, 0.34, 0, pan, true);
        this.noise(0.28, "lowpass", 520 * det, 68, 0.22, 0, pan, 1.0, true, 0.005);
        this.ring(1720 * det, 0.12, 0.04, 0.02, pan, 8);
        break;
      }
      case "horn": {
        if (this.throttled(name, 280)) return;
        // Braided brass warhorn fifth (A2 + E3 + A3) with natural formant filter swell
        this.filteredTone("sawtooth", 108, 110, 0.68, 0.11, "lowpass", 280, 680, 0, pan, 2.2, 0.06);
        this.filteredTone("sawtooth", 162, 164.81, 0.66, 0.085, "lowpass", 380, 920, 0.03, pan, 2.4, 0.06);
        this.filteredTone("triangle", 216, 220, 0.72, 0.09, "bandpass", 440, 880, 0.05, pan, 1.8, 0.07);
        this.tone("sine", 110, 110, 0.74, 0.12, 0, pan, 0.05);
        break;
      }
      case "error": {
        this.filteredTone("sawtooth", 185, 138, 0.11, 0.075, "lowpass", 620, 280, 0, pan, 1.6, 0.004);
        this.filteredTone("sawtooth", 138, 104, 0.14, 0.075, "lowpass", 520, 220, 0.07, pan, 1.6, 0.004);
        break;
      }
      case "win": {
        // Proud royal brass & timpani victory fanfare (C Major -> G Major -> Bb Major lift -> C Major Finale)
        const brass = (freq: number, dur: number, gain: number, delay: number, p = 0) => {
          this.filteredTone("sawtooth", freq * 0.996, freq, dur, gain, "lowpass", freq * 1.8, freq * 3.6, delay, p, 1.8, 0.018);
          this.tone("triangle", freq, freq * 1.001, dur * 1.05, gain * 0.85, delay, p, 0.014);
        };
        // Pickup & Chord 1: C Major (0.00s)
        this.punch(130.81, 65.41, 0.025, 0.32, 0.18, 0, 0);
        brass(261.63, 0.22, 0.075, 0.0, -0.2);
        brass(329.63, 0.22, 0.065, 0.0, 0.2);
        brass(392.00, 0.22, 0.075, 0.0, 0.0);
        // Step 2: G Major (0.18s)
        brass(293.66, 0.22, 0.07, 0.18, -0.22);
        brass(392.00, 0.22, 0.07, 0.18, 0.22);
        brass(493.88, 0.22, 0.08, 0.18, 0.0);
        // Step 3: Heroic Bb Major lift (0.36s)
        this.punch(116.54, 58.27, 0.025, 0.3, 0.16, 0.36, 0);
        brass(233.08, 0.24, 0.075, 0.36, -0.25);
        brass(349.23, 0.24, 0.07, 0.36, 0.25);
        brass(440.00, 0.24, 0.085, 0.36, 0.0);
        // Step 4: Grand C Major Royal Finale (0.58s)
        this.punch(130.81, 65.41, 0.03, 0.85, 0.24, 0.58, 0, true);
        this.tone("sine", 130.81, 130.81, 0.95, 0.11, 0.58, 0, 0.02);
        brass(261.63, 0.88, 0.08, 0.58, -0.28);
        brass(329.63, 0.88, 0.075, 0.58, 0.28);
        brass(392.00, 0.92, 0.08, 0.58, -0.12);
        brass(523.25, 0.98, 0.095, 0.58, 0.0);
        brass(659.25, 0.92, 0.06, 0.60, 0.18);
        this.noise(0.75, "bandpass", 3200, 5600, 0.045, 0.58, 0, 1.4, false, 0.01);
        break;
      }
      case "lose": {
        // Somber, elegiac D-minor / Phrygian requiem cadence (Dm -> Bbmaj7 -> Gm6 -> Asus4 -> Dm)
        const horn = (f0: number, f1: number, dur: number, gain: number, delay: number, p = 0) => {
          this.filteredTone("sawtooth", f0, f1, dur, gain, "lowpass", f0 * 2.4, f1 * 1.4, delay, p, 1.5, 0.045);
          this.tone("triangle", f0, f1, dur * 1.08, gain * 0.9, delay, p, 0.04);
        };
        // Phrase 1: D minor sigh (0.00s)
        this.tone("sine", 73.42, 73.0, 0.7, 0.1, 0, 0, 0.04);
        horn(293.66, 290.0, 0.46, 0.065, 0.0, -0.2);
        horn(349.23, 346.0, 0.46, 0.06, 0.0, 0.2);
        horn(440.00, 434.0, 0.46, 0.07, 0.0, 0.0);
        // Phrase 2: Bb major 7 melancholic descent (0.38s)
        this.tone("sine", 58.27, 58.0, 0.7, 0.095, 0.38, 0, 0.04);
        horn(233.08, 230.0, 0.46, 0.06, 0.38, -0.22);
        horn(293.66, 290.0, 0.46, 0.055, 0.38, 0.22);
        horn(392.00, 386.0, 0.46, 0.068, 0.38, 0.0);
        // Phrase 3: G minor / E half-diminished tension (0.76s)
        this.tone("sine", 55.0, 54.5, 0.7, 0.095, 0.76, 0, 0.04);
        horn(196.00, 193.0, 0.46, 0.06, 0.76, -0.2);
        horn(261.63, 258.0, 0.46, 0.055, 0.76, 0.2);
        horn(329.63, 324.0, 0.46, 0.065, 0.76, 0.0);
        // Phrase 4: Deep D minor final resolution (1.14s)
        this.punch(73.42, 36.71, 0.04, 0.85, 0.15, 1.14, 0);
        this.tone("sine", 73.42, 72.5, 1.15, 0.11, 1.14, 0, 0.05);
        horn(146.83, 145.0, 1.05, 0.07, 1.14, -0.25);
        horn(220.00, 217.5, 1.05, 0.06, 1.14, 0.25);
        horn(293.66, 289.0, 1.1, 0.075, 1.14, 0.0);
        break;
      }
    }
  }
}
