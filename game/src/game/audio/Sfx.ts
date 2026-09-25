/** Procedural WebAudio sound design — every cue is synthesized at runtime (no copyrighted samples). */
export type SfxName = "shoot" | "roller_flick" | "roller_roll" | "charger_charge" | "charger_full" | "charger_fire" | "impact" | "swim" | "jump" | "land" | "hit" | "splat" | "ui" | "countdown" | "start" | "whistle" | "result" | "hit_confirm" | "respawn";

export class Sfx {
  ctx: AudioContext | null = null;
  master!: GainNode;
  private noiseBuf!: AudioBuffer;
  private lastPlay = new Map<string, number>();
  private rollNode: { g: GainNode; src: AudioBufferSourceNode } | null = null;
  enabled = true;
  private chargeOsc: { o: OscillatorNode; g: GainNode } | null = null;

  init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  private noise(dur: number, vol: number, filterHz: number, q = 1, type: BiquadFilterType = "bandpass", pan = 0) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterHz; f.Q.value = q;
    const g = this.ctx.createGain(); const t = this.ctx.currentTime;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const p = this.ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(f); f.connect(g); g.connect(p); p.connect(this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  private tone(freq: number, dur: number, vol: number, type: OscillatorType = "sine", slideTo?: number, pan = 0) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(); o.type = type; const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const p = this.ctx.createStereoPanner(); p.pan.value = pan;
    o.connect(g); g.connect(p); p.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }

  play(name: SfxName, vol = 1, pan = 0) {
    if (!this.ctx || !this.enabled) return;
    const now = performance.now(); const last = this.lastPlay.get(name) ?? 0;
    const minGap = name === "shoot" ? 40 : name === "impact" ? 25 : 60;
    if (now - last < minGap) return; this.lastPlay.set(name, now);
    pan = Math.max(-1, Math.min(1, pan));
    switch (name) {
      case "shoot": this.noise(0.09, 0.5 * vol, 1800 + Math.random() * 600, 0.8, "bandpass", pan); this.tone(420 + Math.random() * 80, 0.06, 0.12 * vol, "triangle", 180, pan); break;
      case "impact": this.noise(0.12, 0.25 * vol, 900 + Math.random() * 400, 1.2, "lowpass", pan); break;
      case "roller_flick": this.noise(0.35, 0.7 * vol, 700, 0.7, "lowpass", pan); this.tone(160, 0.25, 0.25 * vol, "sawtooth", 60, pan); break;
      case "charger_charge": this.startCharge(); break;
      case "charger_full": this.tone(1400, 0.12, 0.25 * vol, "square", 1800, pan); this.stopCharge(); break;
      case "charger_fire": this.stopCharge(); this.noise(0.25, 0.8 * vol, 2500, 1, "highpass", pan); this.tone(900, 0.3, 0.3 * vol, "sawtooth", 120, pan); break;
      case "swim": this.noise(0.15, 0.25 * vol, 500, 0.8, "lowpass", pan); this.tone(300, 0.12, 0.08 * vol, "sine", 120, pan); break;
      case "jump": this.tone(300, 0.15, 0.15 * vol, "sine", 520, pan); break;
      case "land": this.noise(0.08, 0.2 * vol, 400, 1, "lowpass", pan); break;
      case "hit": this.tone(220, 0.1, 0.3 * vol, "square", 110, pan); this.noise(0.1, 0.3 * vol, 1200, 1, "bandpass", pan); break;
      case "hit_confirm": this.tone(1100, 0.05, 0.12 * vol, "square", 1300, pan); break;
      case "splat": this.noise(0.5, 0.9 * vol, 600, 0.6, "lowpass", pan); this.tone(500, 0.4, 0.3 * vol, "sawtooth", 60, pan); break;
      case "respawn": this.tone(520, 0.3, 0.2, "triangle", 1040); break;
      case "ui": this.tone(880, 0.08, 0.15, "square", 1100); break;
      case "countdown": this.tone(660, 0.18, 0.3, "square"); break;
      case "start": this.tone(880, 0.5, 0.35, "square", 1320); this.noise(0.4, 0.3, 3000, 1, "highpass"); break;
      case "whistle": this.tone(1500, 0.7, 0.3, "sine", 1700); this.tone(1520, 0.7, 0.2, "triangle", 1720); break;
      case "result": this.tone(523, 0.3, 0.3, "square"); setTimeout(() => this.tone(659, 0.3, 0.3, "square"), 180); setTimeout(() => this.tone(784, 0.6, 0.35, "square"), 360); break;
      case "roller_roll": break;
    }
  }

  setRolling(on: boolean, speed: number) {
    if (!this.ctx) return;
    if (on && !this.rollNode) {
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 300;
      const g = this.ctx.createGain(); g.gain.value = 0.0001;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      this.rollNode = { g, src };
    }
    if (this.rollNode) {
      const target = on ? 0.05 + Math.min(0.25, speed * 0.04) : 0.0001;
      this.rollNode.g.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
      if (!on) { const n = this.rollNode; this.rollNode = null; setTimeout(() => { try { n.src.stop(); } catch { /* */ } }, 300); }
    }
  }

  private startCharge() {
    if (!this.ctx || this.chargeOsc) return;
    const o = this.ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 200;
    const g = this.ctx.createGain(); g.gain.value = 0.06;
    o.connect(g); g.connect(this.master); o.start();
    this.chargeOsc = { o, g };
  }
  setChargeLevel(level: number) {
    if (!this.ctx || !this.chargeOsc) return;
    this.chargeOsc.o.frequency.setTargetAtTime(200 + level * 900, this.ctx.currentTime, 0.03);
  }
  stopCharge() {
    if (!this.chargeOsc) return;
    const c = this.chargeOsc; this.chargeOsc = null;
    c.g.gain.setTargetAtTime(0.0001, this.ctx!.currentTime, 0.03);
    setTimeout(() => { try { c.o.stop(); } catch { /* */ } }, 200);
  }
}
