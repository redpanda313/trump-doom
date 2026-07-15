/** Procedural synth-rock bed + combat SFX via Web Audio. */

const STORAGE_KEY = 'trump-doom-audio';

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
}

const DEFAULTS: AudioSettings = {
  master: 0.8,
  music: 0.55,
  sfx: 0.85,
};

export function loadAudioSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      master: clamp01(parsed.master ?? DEFAULTS.master),
      music: clamp01(parsed.music ?? DEFAULTS.music),
      sfx: clamp01(parsed.sfx ?? DEFAULTS.sfx),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveAudioSettings(s: AudioSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private step = 0;
  enabled = false;
  settings: AudioSettings = loadAudioSettings();

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
    this.startMusic();
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  setMaster(v: number) {
    this.settings.master = clamp01(v);
    this.applyGains();
    saveAudioSettings(this.settings);
  }

  setMusic(v: number) {
    this.settings.music = clamp01(v);
    this.applyGains();
    saveAudioSettings(this.settings);
  }

  setSfx(v: number) {
    this.settings.sfx = clamp01(v);
    this.applyGains();
    saveAudioSettings(this.settings);
  }

  private applyGains() {
    // Base bus levels tuned so sliders at ~0.5–0.8 feel natural
    if (this.master) this.master.gain.value = this.settings.master * 0.55;
    if (this.musicGain) this.musicGain.gain.value = this.settings.music * 0.35;
    if (this.sfxGain) this.sfxGain.gain.value = this.settings.sfx * 0.7;
  }

  private startMusic() {
    if (!this.ctx || !this.musicGain || this.musicTimer != null) return;
    const bpm = 132;
    const beat = 60 / bpm;
    const schedule = () => {
      if (!this.ctx || !this.musicGain) return;
      const t0 = this.ctx.currentTime;
      const root = 55;
      const bassNotes = [0, 0, 3, 5, 0, 7, 5, 3];
      const leadNotes = [12, 15, 19, 15, 12, 17, 19, 22];
      const n = bassNotes[this.step % bassNotes.length]!;
      const l = leadNotes[this.step % leadNotes.length]!;
      this.tone(root * Math.pow(2, n / 12), t0, beat * 0.45, 'sawtooth', 0.12, this.musicGain);
      if (this.step % 2 === 0) {
        this.tone(root * 2 * Math.pow(2, l / 12), t0, beat * 0.2, 'square', 0.04, this.musicGain);
      }
      if (this.step % 2 === 0) {
        this.tone(80, t0, 0.08, 'sine', 0.15, this.musicGain);
      }
      if (this.step % 4 === 2) {
        this.noise(t0, 0.05, 0.06, this.musicGain);
      }
      this.step++;
    };
    schedule();
    this.musicTimer = window.setInterval(schedule, beat * 1000);
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
}
