/**
 * Procedural 1920s parlor / ragtime-tinged score for the tutorial lab.
 * No external assets — Web Audio oscillators only.
 */

export class ForgeAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private step = 0;
  private tension = 0; // 0 calm lab · 1 siege
  enabled = false;

  async resume() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.28;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.7;
      this.sfxGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.enabled = true;
    this.ensureMusic();
  }

  setTension(t: number) {
    this.tension = Math.max(0, Math.min(1, t));
  }

  private ensureMusic() {
    if (!this.ctx || !this.musicGain || this.musicTimer != null) return;
    // ~120 bpm, swung eighths — parlor ragtime feel
    const beatMs = 250;
    this.musicTimer = window.setInterval(() => this.tickMusic(), beatMs);
  }

  private tickMusic() {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    const s = this.step % 16;
    this.step++;

    // C major rag stride-ish: bass on 1 & 3, chord stabs on offbeats
    const bass = [130.81, 0, 164.81, 0, 174.61, 0, 164.81, 0, 130.81, 0, 146.83, 0, 174.61, 0, 196.0, 0];
    const melody = [
      523.25, 0, 587.33, 659.25, 0, 587.33, 523.25, 0, 493.88, 523.25, 0, 392.0, 440.0, 0, 493.88, 523.25,
    ];
    // Minor tension when demons bang
    const darkBass = [110, 0, 130.81, 0, 146.83, 0, 130.81, 0, 110, 0, 123.47, 0, 146.83, 0, 164.81, 0];
    const darkMel = [440, 0, 415.3, 392, 0, 349.23, 392, 0, 415.3, 440, 0, 329.63, 349.23, 0, 392, 415.3];

    const useDark = this.tension > 0.35;
    const b = (useDark ? darkBass : bass)[s]!;
    const m = (useDark ? darkMel : melody)[s]!;

    if (b > 0) this.tone(b, t, 0.18, 0.07 + this.tension * 0.02, 'triangle', this.musicGain);
    // swing: delay odd steps slightly
    const swing = s % 2 === 1 ? 0.04 : 0;
    if (m > 0) this.tone(m, t + swing, 0.12, 0.035, 'square', this.musicGain);
    // soft hi-hat tick
    if (s % 2 === 0) this.noise(t, 0.03, 0.012, this.musicGain);
  }

  private tone(
    freq: number,
    when: number,
    dur: number,
    gain: number,
    type: OscillatorType,
    dest: AudioNode,
  ) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    g.connect(dest);
    o.start(when);
    o.stop(when + dur + 0.02);
  }

  private noise(when: number, dur: number, gain: number, dest: AudioNode) {
    if (!this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 4000;
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(when);
  }

  /** Heavy door bang */
  playBang(intensity = 1) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.tone(55 + intensity * 20, t, 0.35, 0.35 * intensity, 'sine', this.sfxGain);
    this.tone(90, t, 0.2, 0.2 * intensity, 'triangle', this.sfxGain);
    this.noise(t, 0.25, 0.18 * intensity, this.sfxGain);
  }

  playPickup() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.tone(660, t, 0.08, 0.1, 'square', this.sfxGain);
    this.tone(880, t + 0.07, 0.1, 0.08, 'square', this.sfxGain);
  }

  playReprogram() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.tone(220, t, 0.15, 0.12, 'sawtooth', this.sfxGain);
    this.tone(330, t + 0.12, 0.2, 0.1, 'sawtooth', this.sfxGain);
    this.tone(440, t + 0.28, 0.25, 0.08, 'triangle', this.sfxGain);
  }

  playWin() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    [392, 494, 587, 784].forEach((f, i) => {
      this.tone(f, t + i * 0.14, 0.28, 0.12, 'triangle', this.sfxGain!);
    });
  }
}
