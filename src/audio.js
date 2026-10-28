// All sound is synthesised with WebAudio; dialogue is read out by the browser's speech synthesis.

const VOICES = {
  argaman: { pitch: 1.0, rate: 1.05 },
  caller: { pitch: 0.2, rate: 0.85 },
  meteo: { pitch: 1.5, rate: 1.25 },
  gate: { pitch: 0.75, rate: 0.95 },
  nice: { pitch: 1.35, rate: 1.1 },
  officer: { pitch: 0.55, rate: 0.75 },
  narrator: { pitch: 0.9, rate: 1.0 },
  andrey: { pitch: 0.45, rate: 1.45 },
  wide: { pitch: 0.45, rate: 0.85 },
  tall: { pitch: 1.25, rate: 0.8 },
  monkey: { pitch: 2, rate: 1.7 },
  kipa: { pitch: 1.0, rate: 1.0 },
  beard: { pitch: 0.7, rate: 0.95 },
};

class Audio {
  constructor() {
    this.ac = null;
    this.muted = false;
    this.voices = true;
    this.ringing = null;
  }

  init() {
    if (this.ac) return;
    try {
      this.ac = new AudioContext();
      this.master = this.ac.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ac.destination);
      const len = this.ac.sampleRate * 2;
      this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ac = null;
    }
  }

  get ok() {
    return this.ac && !this.muted;
  }

  tone(freq, start, dur, { type = 'sine', vol = 0.3, slide = null, attack = 0.01 } = {}) {
    if (!this.ok) return;
    const t = this.ac.currentTime + start;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(start, dur, { vol = 0.4, freq = 800, q = 0.7, type = 'lowpass', slide = null } = {}) {
    if (!this.ok) return;
    const t = this.ac.currentTime + start;
    const s = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
    s.buffer = this.noiseBuf;
    s.loop = true;
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur);
    f.Q.value = q;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  // Phone ringtone: repeats until stopRing()
  ring() {
    if (!this.ok || this.ringing) return;
    const burst = () => {
      for (let i = 0; i < 6; i++) {
        this.tone(1320, i * 0.1, 0.08, { type: 'square', vol: 0.07 });
        this.tone(1760, i * 0.1 + 0.05, 0.05, { type: 'square', vol: 0.05 });
      }
    };
    burst();
    this.ringing = setInterval(burst, 1400);
  }

  stopRing() {
    clearInterval(this.ringing);
    this.ringing = null;
  }

  thunder() {
    this.noise(0, 0.25, { vol: 1.2, freq: 3000, slide: 300 });
    this.noise(0.05, 3.5, { vol: 0.9, freq: 260, slide: 60 });
    this.noise(0.6, 2.5, { vol: 0.5, freq: 140, q: 2 });
  }

  rumble() {
    this.noise(0, 3, { vol: 0.35, freq: 120, slide: 50 });
  }

  whoosh() {
    this.noise(0, 1.4, { vol: 0.5, freq: 400, slide: 3000, type: 'bandpass', q: 1.5 });
  }

  splat() {
    this.noise(0, 0.35, { vol: 0.9, freq: 500, slide: 80 });
    this.tone(90, 0, 0.3, { type: 'sine', vol: 0.5, slide: 40 });
  }

  alert() {
    this.tone(880, 0, 0.12, { type: 'sawtooth', vol: 0.15 });
    this.tone(1320, 0.12, 0.25, { type: 'sawtooth', vol: 0.15 });
  }

  suspicious() {
    this.tone(520, 0, 0.18, { type: 'triangle', vol: 0.12, slide: 700 });
  }

  honk() {
    this.tone(392, 0, 0.35, { type: 'sawtooth', vol: 0.12 });
    this.tone(466, 0, 0.35, { type: 'sawtooth', vol: 0.1 });
  }

  chime() {
    // Israel Railways door chime
    this.tone(659, 0, 0.5, { vol: 0.2 });
    this.tone(523, 0.35, 0.8, { vol: 0.2 });
  }

  ding() {
    this.tone(1046, 0, 1.2, { vol: 0.25 });
    this.tone(1568, 0, 0.9, { vol: 0.1 });
  }

  plop() {
    this.tone(240 + Math.random() * 120, 0, 0.12, { vol: 0.08, slide: 120 });
  }

  kipa() {
    this.noise(0, 0.5, { vol: 0.35, freq: 900, slide: 2500, type: 'bandpass', q: 3 });
    this.tone(330, 0, 0.25, { type: 'triangle', vol: 0.1, slide: 660 });
  }

  clang(vol = 1) {
    // vibranium? no, crochet. Still clangs.
    this.tone(1240, 0, 0.6, { type: 'triangle', vol: 0.18 * vol, slide: 1180 });
    this.tone(1870, 0, 0.4, { vol: 0.1 * vol });
    this.noise(0, 0.12, { vol: 0.5 * vol, freq: 3000, type: 'highpass' });
  }

  boom(vol = 1) {
    this.noise(0, 2.2, { vol: 0.9 * vol, freq: 300, slide: 40 });
    this.tone(60, 0, 1.4, { type: 'sine', vol: 0.6 * vol, slide: 25 });
  }

  glass() {
    this.noise(0, 0.6, { vol: 0.8, freq: 4000, type: 'highpass' });
    for (let i = 0; i < 9; i++) this.tone(2500 + Math.random() * 3500, 0.05 + Math.random() * 0.5, 0.15, { vol: 0.06 });
  }

  laser() {
    this.tone(1800, 0, 0.9, { type: 'sawtooth', vol: 0.09, slide: 220 });
    this.tone(2400, 0.05, 0.8, { type: 'square', vol: 0.05, slide: 300 });
  }

  catchKipa() {
    this.tone(700, 0, 0.08, { type: 'square', vol: 0.06 });
    this.tone(1050, 0.06, 0.12, { vol: 0.12 });
  }

  click() {
    this.tone(1800, 0, 0.04, { type: 'square', vol: 0.05 });
  }

  train(depart = true) {
    this.noise(0, 6, { vol: 0.25, freq: depart ? 200 : 900, slide: depart ? 900 : 150, type: 'bandpass', q: 0.8 });
  }

  // Elevator music: a slow little bossa loop for `sec` seconds
  music(sec) {
    if (!this.ok) return;
    const notes = [523, 659, 784, 659, 587, 698, 880, 698, 523, 659, 784, 988, 880, 784, 659, 587];
    const n = Math.floor(sec / 0.3);
    for (let i = 0; i < n; i++) {
      this.tone(notes[i % notes.length], i * 0.3, 0.28, { type: 'triangle', vol: 0.07 });
      if (i % 4 === 0) this.tone(notes[i % notes.length] / 4, i * 0.3, 0.6, { vol: 0.08 });
    }
  }

  fanfare() {
    if (!this.ok) return;
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, i * 0.16, i === 5 ? 1.2 : 0.2, { type: 'square', vol: 0.08 }));
  }

  say(text, voice = 'narrator') {
    if (!this.voices || this.muted || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = VOICES[voice] || VOICES.narrator;
      u.pitch = v.pitch;
      u.rate = v.rate;
      u.lang = 'en-US';
      u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch {
      /* no speech */
    }
  }
}

export const audio = new Audio();
