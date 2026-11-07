/** Tiny procedural sound engine. AudioContext is created only from a user gesture. */
export class AudioEngine {
  constructor() { this.enabled = false; this.context = null; }
  async toggle() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.context = new AudioContext();
      this.master = this.context.createGain(); this.master.gain.value = .09;
      this.master.connect(this.context.destination);
      this.engine = this.context.createOscillator(); this.engine.type = 'sawtooth';
      this.filter = this.context.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 240;
      this.engineGain = this.context.createGain(); this.engineGain.gain.value = 0;
      this.engine.connect(this.filter); this.filter.connect(this.engineGain); this.engineGain.connect(this.master); this.engine.start();
    }
    this.enabled = !this.enabled;
    if (this.enabled) await this.context.resume();
    else this.engineGain.gain.setTargetAtTime(0, this.context.currentTime, .05);
    return this.enabled;
  }
  update(speed, active) {
    if (!this.context || !this.enabled) return;
    this.engine.frequency.setTargetAtTime(42 + speed * 3.1, this.context.currentTime, .1);
    this.engineGain.gain.setTargetAtTime(active ? .2 : 0, this.context.currentTime, .15);
  }
  tone(frequency, duration, type = 'sine', volume = .3) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * .25, now + duration);
    gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    oscillator.connect(gain); gain.connect(this.master); oscillator.start(now); oscillator.stop(now + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
}
