/**
 * Procedural 1920s parlor / ragtime-tinged score for the tutorial lab.
 * No external assets — Web Audio oscillators only.
 */

export class ForgeAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private boardHumGain: GainNode | null = null;
  private boardHumOsc: OscillatorNode | null = null;
  private boardHumOsc2: OscillatorNode | null = null;
  private boardRushGain: GainNode | null = null;
  private boardRushFilter: BiquadFilterNode | null = null;
  private boardRushSource: AudioBufferSourceNode | null = null;
  private boardJetGain: GainNode | null = null;
  private boardJetOsc: OscillatorNode | null = null;
  private musicTimer: number | null = null;
  private step = 0;
  private tension = 0; // 0 calm lab · 1 siege
  /** 0 indoor · 1 full outdoor wind */
  private windAmount = 0;
  private whooshCd = 0;
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
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0;
      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 420;
      this.windFilter.Q.value = 0.7;
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.master);
      this.startWindLoop();
      this.initBoardAudio();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.enabled = true;
    this.ensureMusic();
  }

  private initBoardAudio() {
    if (!this.ctx || !this.master) return;
    // Gentle idle hum-hum-hum
    this.boardHumGain = this.ctx.createGain();
    this.boardHumGain.gain.value = 0;
    this.boardHumGain.connect(this.master);
    this.boardHumOsc = this.ctx.createOscillator();
    this.boardHumOsc.type = 'sine';
    this.boardHumOsc.frequency.value = 92;
    this.boardHumOsc2 = this.ctx.createOscillator();
    this.boardHumOsc2.type = 'triangle';
    this.boardHumOsc2.frequency.value = 138;
    const humFilter = this.ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 400;
    this.boardHumOsc.connect(humFilter);
    this.boardHumOsc2.connect(humFilter);
    humFilter.connect(this.boardHumGain);
    this.boardHumOsc.start();
    this.boardHumOsc2.start();

    // Rushing wind with speed
    this.boardRushGain = this.ctx.createGain();
    this.boardRushGain.gain.value = 0;
    this.boardRushFilter = this.ctx.createBiquadFilter();
    this.boardRushFilter.type = 'bandpass';
    this.boardRushFilter.frequency.value = 800;
    this.boardRushFilter.Q.value = 0.5;
    this.boardRushFilter.connect(this.boardRushGain);
    this.boardRushGain.connect(this.master);
    const sec = 3;
    const n = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      b0 = (b0 + 0.02 * white) / 1.02;
      data[i] = b0 * 3.5;
    }
    this.boardRushSource = this.ctx.createBufferSource();
    this.boardRushSource.buffer = buf;
    this.boardRushSource.loop = true;
    this.boardRushSource.connect(this.boardRushFilter);
    this.boardRushSource.start();

    // Top-speed sweet jet
    this.boardJetGain = this.ctx.createGain();
    this.boardJetGain.gain.value = 0;
    this.boardJetGain.connect(this.master);
    this.boardJetOsc = this.ctx.createOscillator();
    this.boardJetOsc.type = 'sawtooth';
    this.boardJetOsc.frequency.value = 55;
    const jetF = this.ctx.createBiquadFilter();
    jetF.type = 'lowpass';
    jetF.frequency.value = 900;
    const jetF2 = this.ctx.createBiquadFilter();
    jetF2.type = 'bandpass';
    jetF2.frequency.value = 1200;
    jetF2.Q.value = 2;
    this.boardJetOsc.connect(jetF);
    jetF.connect(jetF2);
    jetF2.connect(this.boardJetGain);
    this.boardJetOsc.start();
  }

  /**
   * Board audio bed.
   * @param idle 1 when board nearby / idle bobbing
   * @param speedNorm 0..1 when riding
   */
  setBoardAudio(idle: number, speedNorm: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const hum = Math.max(idle * 0.045, speedNorm > 0.02 ? 0.02 : 0);
    if (this.boardHumGain) {
      this.boardHumGain.gain.setTargetAtTime(hum, t, 0.12);
    }
    if (this.boardHumOsc) {
      // Gentle "hum hum hum" vibrato
      const vib = 92 + Math.sin(t * 3.2) * 4 + speedNorm * 20;
      this.boardHumOsc.frequency.setTargetAtTime(vib, t, 0.05);
    }
    if (this.boardHumOsc2) {
      this.boardHumOsc2.frequency.setTargetAtTime(138 + Math.sin(t * 2.1) * 6, t, 0.05);
    }
    // Rush scales with speed
    const rush = speedNorm * speedNorm * 0.16;
    if (this.boardRushGain) this.boardRushGain.gain.setTargetAtTime(rush, t, 0.1);
    if (this.boardRushFilter) {
      this.boardRushFilter.frequency.setTargetAtTime(500 + speedNorm * 2400, t, 0.1);
    }
    // Jet only near top speed
    const jet = Math.max(0, speedNorm - 0.72) / 0.28;
    if (this.boardJetGain) this.boardJetGain.gain.setTargetAtTime(jet * 0.07, t, 0.15);
    if (this.boardJetOsc) {
      this.boardJetOsc.frequency.setTargetAtTime(48 + speedNorm * 40, t, 0.08);
    }
  }

  /** Doppler-ish whoosh when passing a prop at speed */
  playPassWhoosh(intensity = 1) {
    if (!this.ctx || !this.sfxGain) return;
    if (this.whooshCd > 0) return;
    this.whooshCd = 0.18;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(420 + intensity * 200, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.22);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * intensity, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    o.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + 0.28);
    this.noise(t, 0.15, 0.06 * intensity, this.sfxGain);
  }

  tickWhooshCd(dt: number) {
    this.whooshCd = Math.max(0, this.whooshCd - dt);
  }

  setTension(t: number) {
    this.tension = Math.max(0, Math.min(1, t));
  }

  /**
   * Outdoor wind bed. amount 0 = lab silence, 1 = open sky dock.
   * Call each frame with a smoothed target.
   */
  setWind(amount: number) {
    this.windAmount = Math.max(0, Math.min(1, amount));
    if (!this.ctx || !this.windGain || !this.windFilter) return;
    const t = this.ctx.currentTime;
    const g = 0.0001 + this.windAmount * 0.14;
    this.windGain.gain.cancelScheduledValues(t);
    this.windGain.gain.setTargetAtTime(g, t, 0.35);
    // Brighter, harsher wind when fully outside / under tension
    const freq = 280 + this.windAmount * 220 + this.tension * 80;
    this.windFilter.frequency.setTargetAtTime(freq, t, 0.4);
  }

  private startWindLoop() {
    if (!this.ctx || !this.windFilter || this.windSource) return;
    // Long looping noise buffer
    const sec = 4;
    const n = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0;
    // Brown-ish noise (softer wind than pure white)
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      data[i] = (b0 + b1 + b2 + white * 0.05) * 0.35;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.windFilter);
    src.start();
    this.windSource = src;
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
