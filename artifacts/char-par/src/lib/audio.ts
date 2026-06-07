class SoundSystem {
  private audioCtx: AudioContext | null = null;

  private init() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  private playTone(freq: number, type: OscillatorType, duration: number, vol: number = 0.1) {
    this.init();
    if (!this.audioCtx) return;

    const osc = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

    gainNode.gain.setValueAtTime(vol, this.audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);

    osc.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);

    osc.start();
    osc.stop(this.audioCtx.currentTime + duration);
  }

  playPlace() {
    this.playTone(400, 'sine', 0.1, 0.2);
  }

  playMove() {
    this.playTone(300, 'triangle', 0.2, 0.15);
  }

  playWin() {
    this.init();
    if (!this.audioCtx) return;
    // Simple C major arpeggio
    this.playTone(523.25, 'sine', 0.3, 0.2);
    setTimeout(() => this.playTone(659.25, 'sine', 0.3, 0.2), 100);
    setTimeout(() => this.playTone(783.99, 'sine', 0.4, 0.2), 200);
    setTimeout(() => this.playTone(1046.50, 'sine', 0.6, 0.2), 300);
  }

  playLose() {
    this.playTone(150, 'sawtooth', 0.5, 0.3);
    setTimeout(() => this.playTone(100, 'sawtooth', 0.6, 0.3), 200);
  }
}

export const soundSystem = new SoundSystem();
