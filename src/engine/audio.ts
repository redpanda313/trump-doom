/** Procedural synth-rock — multiple section themes. */

import { loadSettings, saveSettings, type GameSettings } from '../game/settings';
import type { MusicThemeId } from '../game/campaign';

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private step = 0;
  private theme: MusicThemeId = 'ambition';
  enabled = false;
  settings: GameSettings = loadSettings();

  async resume() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.applyGains();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.enabled = true;
    this.ensureMusic();
  }

  setTheme(theme: MusicThemeId) {
    if (this.theme === theme) return;
    this.theme = theme;
    this.step = 0;
    // restart loop with new pattern
    if (this.musicTimer != null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.enabled) this.ensureMusic();
  }

  getTheme(): MusicThemeId {
    return this.theme;
  }

  getSettings(): GameSettings {
    return { ...this.settings };
  }

  setMaster(v: number) {
    this.settings.master = clamp01(v);
    this.persist();
  }

  setMusic(v: number) {
    this.settings.music = clamp01(v);
    this.persist();
  }

  setSfx(v: number) {
    this.settings.sfx = clamp01(v);
    this.persist();
  }

  setMouseSensitivity(v: number) {
    this.settings.mouseSensitivity = Math.max(0.15, Math.min(3, v));
    saveSettings(this.settings);
  }

  private persist() {
    this.applyGains();
    saveSettings(this.settings);
  }

  private applyGains() {
    if (this.master) this.master.gain.value = this.settings.master * 0.55;
    if (this.musicGain) this.musicGain.gain.value = this.settings.music * 0.35;
    if (this.sfxGain) this.sfxGain.gain.value = this.settings.sfx * 0.7;
  }

  private themeParams(): {
    bpm: number;
    root: number;
    bass: number[];
    lead: number[];
    leadWave: OscillatorType;
  } {
    switch (this.theme) {
      case 'campus':
        // Brighter, faster protest march — NEW song for Ep 2+
        return {
          bpm: 148,
          root: 65.4, // C2
          bass: [0, 0, 5, 7, 0, 8, 7, 5, 3, 5, 7, 10],
          lead: [12, 15, 19, 17, 15, 12, 19, 22, 17, 15, 12, 15],
          leadWave: 'square',
        };
      case 'bureau':
        return {
          bpm: 118,
          root: 49,
          bass: [0, 0, 0, 1, 0, 0, 3, 1],
          lead: [7, 7, 8, 7, 5, 3, 5, 7],
          leadWave: 'triangle',
        };
      case 'catacombs':
        return {
          bpm: 100,
          root: 41,
          bass: [0, 3, 0, 5, 0, 3, 7, 5],
          lead: [12, 10, 8, 7, 8, 10, 12, 15],
          leadWave: 'sawtooth',
        };
      case 'tribunal':
        return {
          bpm: 128,
          root: 55,
          bass: [0, 0, 7, 0, 5, 0, 7, 10],
          lead: [19, 17, 15, 12, 15, 17, 19, 22],
          leadWave: 'square',
        };
      case 'primetime':
        return {
          bpm: 140,
          root: 58.27,
          bass: [0, 5, 7, 5, 0, 8, 7, 3],
          lead: [12, 16, 19, 16, 12, 19, 23, 19],
          leadWave: 'square',
        };
      case 'finale':
        return {
          bpm: 136,
          root: 51.91,
          bass: [0, 0, 5, 7, 8, 7, 5, 3, 0, 7, 10, 12],
          lead: [12, 15, 19, 24, 19, 15, 17, 22, 19, 15, 12, 15],
          leadWave: 'sawtooth',
        };
      case 'ambition':
      default:
        return {
          bpm: 132,
          root: 55,
          bass: [0, 0, 3, 5, 0, 7, 5, 3],
          lead: [12, 15, 19, 15, 12, 17, 19, 22],
          leadWave: 'square',
        };
    }
  }

  private ensureMusic() {
    if (!this.ctx || !this.musicGain || this.musicTimer != null) return;
    const schedule = () => {
      if (!this.ctx || !this.musicGain) return;
      const p = this.themeParams();
      const beat = 60 / p.bpm;
      const t0 = this.ctx.currentTime;
      const n = p.bass[this.step % p.bass.length]!;
      const l = p.lead[this.step % p.lead.length]!;
      this.tone(p.root * Math.pow(2, n / 12), t0, beat * 0.45, 'sawtooth', 0.12, this.musicGain);
      if (this.step % 2 === 0) {
        this.tone(
          p.root * 2 * Math.pow(2, l / 12),
          t0,
          beat * 0.22,
          p.leadWave,
          0.045,
          this.musicGain,
        );
      }
      if (this.step % 2 === 0) {
        this.tone(72, t0, 0.08, 'sine', 0.14, this.musicGain);
      }
      if (this.step % 4 === 2) {
        this.noise(t0, 0.05, 0.06, this.musicGain);
      }
      // campus extra clap on offbeats
      if (this.theme === 'campus' && this.step % 2 === 1) {
        this.noise(t0, 0.03, 0.05, this.musicGain);
      }
      // finale brass stab
      if (this.theme === 'finale' && this.step % 8 === 0) {
        this.tone(p.root * 4, t0, 0.15, 'sawtooth', 0.05, this.musicGain);
      }
      this.step++;
      // re-arm interval if bpm theme changed mid-flight — interval fixed at start
    };
    const beatMs = (60 / this.themeParams().bpm) * 1000;
    schedule();
    this.musicTimer = window.setInterval(schedule, beatMs);
  }

  private tone(
    freq: number,
    when: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    dest: AudioNode,
  ) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private noise(when: number, dur: number, vol: number, dest: AudioNode) {
    if (!this.ctx) return;
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(g);
    g.connect(dest);
    src.start(when);
  }

  gavel() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.tone(180, t, 0.08, 'triangle', 0.3, this.sfxGain);
    this.tone(90, t + 0.05, 0.1, 'sine', 0.25, this.sfxGain);
  }

  mic() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.tone(440, t, 0.05, 'square', 0.08, this.sfxGain);
    this.noise(t, 0.04, 0.1, this.sfxGain);
  }

  hit() {
    if (!this.ctx || !this.sfxGain) return;
    this.tone(220, this.ctx.currentTime, 0.06, 'sawtooth', 0.12, this.sfxGain);
  }

  trumpTrain() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.tone(520, t, 0.15, 'sine', 0.2, this.sfxGain);
    this.tone(780, t + 0.12, 0.2, 'sine', 0.18, this.sfxGain);
    this.tone(1040, t + 0.28, 0.25, 'sine', 0.12, this.sfxGain);
  }

  hurt() {
    if (!this.ctx || !this.sfxGain) return;
    this.tone(120, this.ctx.currentTime, 0.15, 'sawtooth', 0.2, this.sfxGain);
  }

  plaque() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.tone(660, t, 0.1, 'sine', 0.12, this.sfxGain);
    this.tone(880, t + 0.1, 0.15, 'sine', 0.1, this.sfxGain);
  }

  pickup() {
    if (!this.ctx || !this.sfxGain) return;
    this.tone(880, this.ctx.currentTime, 0.08, 'square', 0.1, this.sfxGain);
  }

  dash() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.tone(200, t, 0.06, 'sawtooth', 0.1, this.sfxGain);
    this.noise(t, 0.04, 0.08, this.sfxGain);
  }

  uiClick() {
    if (!this.ctx || !this.sfxGain) return;
    this.tone(720, this.ctx.currentTime, 0.04, 'square', 0.06, this.sfxGain);
  }

  button() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.tone(400, t, 0.06, 'square', 0.12, this.sfxGain);
    this.tone(600, t + 0.06, 0.08, 'square', 0.1, this.sfxGain);
  }

  phone() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.tone(480, t, 0.1, 'sine', 0.15, this.sfxGain);
    this.tone(480, t + 0.15, 0.1, 'sine', 0.12, this.sfxGain);
  }

  levelClear() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.tone(523, t, 0.12, 'square', 0.1, this.sfxGain);
    this.tone(659, t + 0.12, 0.12, 'square', 0.1, this.sfxGain);
    this.tone(784, t + 0.24, 0.2, 'square', 0.12, this.sfxGain);
  }

  death() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.tone(150, t, 0.2, 'sawtooth', 0.15, this.sfxGain);
    this.tone(100, t + 0.15, 0.25, 'sine', 0.12, this.sfxGain);
  }
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
