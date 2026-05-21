// Fully synthesised audio via the Web Audio API — no asset files, works
// offline. A browser will not let an AudioContext start without a user
// gesture, so `unlock()` must be called from the first tap/click.

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private humOsc: OscillatorNode | null = null;
  private humGain: GainNode | null = null;

  muted = false;

  /** Call from a user gesture to create / resume the context. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);

      const len = Math.floor(this.ctx.sampleRate * 0.5);
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  private get ready(): boolean {
    return this.ctx !== null && this.master !== null;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, filterFreq: number, filterType: BiquadFilterType = 'bandpass'): void {
    if (!this.ready || !this.noiseBuffer) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  click(): void {
    this.tone(660, 0.08, 'square', 0.12);
  }

  launch(power: number): void {
    this.noise(0.45, 0.32, 700 + power * 1600, 'bandpass');
    this.tone(160, 0.5, 'sawtooth', 0.16, 320 + power * 260);
  }

  clash(intensity: number): void {
    const i = Math.min(intensity, 1);
    this.noise(0.12 + i * 0.1, 0.2 + i * 0.35, 1400 + i * 2600, 'bandpass');
    this.tone(420 + i * 480, 0.16, 'triangle', 0.14 + i * 0.16, 220);
  }

  special(): void {
    this.tone(523, 0.18, 'sawtooth', 0.18);
    this.tone(784, 0.28, 'sawtooth', 0.16);
    this.tone(1046, 0.36, 'triangle', 0.14);
  }

  burst(): void {
    this.noise(0.6, 0.6, 900, 'lowpass');
    this.tone(220, 0.55, 'sawtooth', 0.32, 60);
  }

  win(): void {
    [523, 659, 784, 1046].forEach((f, i) => {
      window.setTimeout(() => this.tone(f, 0.32, 'triangle', 0.22), i * 130);
    });
  }

  lose(): void {
    [392, 330, 262, 196].forEach((f, i) => {
      window.setTimeout(() => this.tone(f, 0.34, 'sawtooth', 0.2), i * 150);
    });
  }

  /** Start the looping spin hum (call once when a battle begins). */
  startHum(): void {
    if (!this.ready || this.humOsc) return;
    const ctx = this.ctx!;
    this.humOsc = ctx.createOscillator();
    this.humGain = ctx.createGain();
    this.humOsc.type = 'triangle';
    this.humOsc.frequency.value = 90;
    this.humGain.gain.value = 0;
    this.humOsc.connect(this.humGain).connect(this.master!);
    this.humOsc.start();
  }

  /** Drive the hum from combined battle energy (0..1). */
  setHum(level: number): void {
    if (!this.humOsc || !this.humGain || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(level * 0.1, t, 0.2);
    this.humOsc.frequency.setTargetAtTime(70 + level * 110, t, 0.2);
  }

  stopHum(): void {
    if (this.humOsc) {
      try {
        this.humOsc.stop();
      } catch {
        /* already stopped */
      }
      this.humOsc.disconnect();
      this.humGain?.disconnect();
      this.humOsc = null;
      this.humGain = null;
    }
  }
}
