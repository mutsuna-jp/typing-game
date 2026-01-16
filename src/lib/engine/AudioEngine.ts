/**
 * Audio Engine
 * Handles all sound synthesis using Web Audio API.
 */
class AudioEngineClass {
  private ctx: AudioContext | null = null;

  init() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (Ctor) this.ctx = new Ctor();
    }
    if (this.ctx?.state === "suspended") this.ctx.resume();
  }

  playTone(
    freq: number,
    type: OscillatorType | string,
    duration: number,
    vol: number,
  ) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type as OscillatorType;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.01,
      this.ctx.currentTime + duration,
    );
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playType() {
    this.playTone(800, "square", 0.05, 0.1);
  }

  playError() {
    this.playTone(150, "sawtooth", 0.2, 0.2);
  }

  playSuccess() {
    this.playTone(1200, "sine", 0.1, 0.1);
  }

  playBonus() {
    this.playTone(1500, "square", 0.1, 0.1);
    setTimeout(() => this.playTone(2000, "square", 0.1, 0.1), 100);
  }

  playGameOver() {
    this.playTone(300, "sawtooth", 0.5, 0.2);
    setTimeout(() => this.playTone(200, "sawtooth", 0.5, 0.2), 400);
  }

  playBeep(freq = 800, dur = 0.1) {
    this.playTone(freq, "sine", dur, 0.1);
  }
}

export const AudioEngine = new AudioEngineClass();
