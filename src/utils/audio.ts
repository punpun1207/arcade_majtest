// Web Audio API Synthesizer for Arcade Retro SFX and Majmaj DX Beats

class SoundController {
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;
  public volume: number = 0.85;
  private lastTapTime: number = 0;
  private lastBreakTime: number = 0;
  private lastSlideTime: number = 0;
  private lastMissTime: number = 0;

  public initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Explicit unlock on user gesture
  public unlock() {
    try {
      const ctx = this.initCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      // Play a short silent click to unlock iOS/Chrome AudioContext
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.01);
    } catch (e) {
      console.warn('Audio unlock warning:', e);
    }
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  // --- MAJMAJ DX AUTHENTIC SFX ---

  // Tap sound: Crisp woodblock clack + high tambourine ring
  public playMaimaiTap(isCritical: boolean = false) {
    if (this.isMuted) return;
    const now = performance.now();
    if (now - this.lastTapTime < 20) return; // Throttle to max 50 hits per sec
    this.lastTapTime = now;
    
    try {
      const ctx = this.initCtx();
      const t = ctx.currentTime;

      // Primary punch clack
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = isCritical ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(isCritical ? 1200 : 960, t);
      osc.frequency.exponentialRampToValueAtTime(isCritical ? 320 : 260, t + 0.07);

      gain.gain.setValueAtTime(0.6 * this.volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.08);

      // High ring bell
      const bell = ctx.createOscillator();
      const bellGain = ctx.createGain();
      bell.type = 'sine';
      bell.frequency.setValueAtTime(isCritical ? 2400 : 1800, t);
      bell.frequency.exponentialRampToValueAtTime(isCritical ? 1600 : 1200, t + 0.12);
      bellGain.gain.setValueAtTime((isCritical ? 0.35 : 0.2) * this.volume, t);
      bellGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      bell.connect(bellGain);
      bellGain.connect(ctx.destination);
      bell.start(t);
      bell.stop(t + 0.12);
    } catch (err) {
      console.warn('Audio play error:', err);
    }
  }

  // Break note sound: High impact crystal shatter + fanfare chime
  public playMaimaiBreak() {
    if (this.isMuted) return;
    const now = performance.now();
    if (now - this.lastBreakTime < 20) return;
    this.lastBreakTime = now;
    
    try {
      const ctx = this.initCtx();
      const t = ctx.currentTime;

      // Heavy punch impact
      const punch = ctx.createOscillator();
      const punchGain = ctx.createGain();
      punch.frequency.setValueAtTime(320, t);
      punch.frequency.exponentialRampToValueAtTime(60, t + 0.15);
      punchGain.gain.setValueAtTime(0.7 * this.volume, t);
      punchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      punch.connect(punchGain);
      punchGain.connect(ctx.destination);
      punch.start(t);
      punch.stop(t + 0.16);

      // Triple crystal chimes
      [1400, 2100, 2800].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.015);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t + idx * 0.015 + 0.22);
        gain.gain.setValueAtTime(0.35 * this.volume, t + idx * 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.015 + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + idx * 0.015);
        osc.stop(t + idx * 0.015 + 0.22);
      });
    } catch (err) {
      console.warn('Audio play error:', err);
    }
  }

  // Slide note sound: Whistling star swoosh
  public playMaimaiSlide() {
    if (this.isMuted) return;
    const now = performance.now();
    if (now - this.lastSlideTime < 20) return;
    this.lastSlideTime = now;
    
    try {
      const ctx = this.initCtx();
      const t = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(700, t);
      osc.frequency.exponentialRampToValueAtTime(1800, t + 0.18);
      gain.gain.setValueAtTime(0.45 * this.volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    } catch (err) {
      console.warn('Audio play error:', err);
    }
  }

  public playMiss() {
    if (this.isMuted) return;
    const now = performance.now();
    if (now - this.lastMissTime < 50) return;
    this.lastMissTime = now;
    
    try {
      const ctx = this.initCtx();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.14);
      gain.gain.setValueAtTime(0.3 * this.volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.14);
    } catch (err) {
      console.warn('Audio play error:', err);
    }
  }

  // Test sound function so user can verify speakers
  public playTestSound() {
    this.unlock();
    this.playMaimaiTap(true);
    setTimeout(() => {
      this.playMaimaiBreak();
    }, 180);
  }

  // --- FULL SYNTH EDM MUSIC ENGINE FOR BUILTIN TRACKS ---
  // Generates energetic Electronic Dance Music when no external MP3 is loaded
  public playSynthBeat(bpm: number, beatIndex: number) {
    if (this.isMuted) return;
    try {
      const ctx = this.initCtx();
      const t = ctx.currentTime;

      // 1. Kick Drum (Punchy 4-on-the-floor on every beat)
      const kickOsc = ctx.createOscillator();
      const kickGain = ctx.createGain();
      kickOsc.type = 'sine';
      kickOsc.frequency.setValueAtTime(150, t);
      kickOsc.frequency.exponentialRampToValueAtTime(38, t + 0.09);
      kickGain.gain.setValueAtTime(0.55 * this.volume, t);
      kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      kickOsc.connect(kickGain);
      kickGain.connect(ctx.destination);
      kickOsc.start(t);
      kickOsc.stop(t + 0.11);

      // 2. Crisp Snare (Beats 2 & 4 in 4/4)
      if (beatIndex % 4 === 1 || beatIndex % 4 === 3) {
        const snareOsc = ctx.createOscillator();
        const snareGain = ctx.createGain();
        snareOsc.type = 'sawtooth';
        snareOsc.frequency.setValueAtTime(320, t);
        snareOsc.frequency.exponentialRampToValueAtTime(120, t + 0.08);
        snareGain.gain.setValueAtTime(0.35 * this.volume, t);
        snareGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        snareOsc.connect(snareGain);
        snareGain.connect(ctx.destination);
        snareOsc.start(t);
        snareOsc.stop(t + 0.09);
      }

      // 3. Cyber Bassline Arpeggiation (A -> F -> C -> G progression)
      const measure = Math.floor(beatIndex / 4);
      const rootNotes = [110, 87.31, 130.81, 98.0]; // A2, F2, C3, G2
      const rootFreq = rootNotes[measure % 4] || 110;
      const subBeat = beatIndex % 4;
      const bassFreq = rootFreq * (subBeat === 1 ? 1.25 : subBeat === 3 ? 1.5 : 1.0);

      const bassOsc = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bassOsc.type = 'sawtooth';
      bassOsc.frequency.setValueAtTime(bassFreq, t);
      bassGain.gain.setValueAtTime(0.25 * this.volume, t);
      bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      bassOsc.connect(bassGain);
      bassGain.connect(ctx.destination);
      bassOsc.start(t);
      bassOsc.stop(t + 0.16);

      // 4. Melodic Synth Chime (Higher register melody on beat 0 and 2)
      if (beatIndex % 2 === 0) {
        const leadFreqs = [440, 523.25, 659.25, 783.99, 880];
        const leadFreq = leadFreqs[(beatIndex * 2) % leadFreqs.length];
        const leadOsc = ctx.createOscillator();
        const leadGain = ctx.createGain();
        leadOsc.type = 'triangle';
        leadOsc.frequency.setValueAtTime(leadFreq, t);
        leadGain.gain.setValueAtTime(0.22 * this.volume, t);
        leadGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        leadOsc.connect(leadGain);
        leadGain.connect(ctx.destination);
        leadOsc.start(t);
        leadOsc.stop(t + 0.14);
      }
    } catch (err) {
      console.warn('Synth beat error:', err);
    }
  }

  // --- RETRO SNAKE SFX ---
  public playSnakeEat(isSpecial = false) {
    if (this.isMuted) return;
    try {
      const ctx = this.initCtx();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isSpecial ? 'square' : 'triangle';
      osc.frequency.setValueAtTime(isSpecial ? 660 : 440, t);
      osc.frequency.exponentialRampToValueAtTime(isSpecial ? 1320 : 880, t + 0.08);
      gain.gain.setValueAtTime(0.35 * this.volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.09);
    } catch (err) {
      console.warn(err);
    }
  }

  public playExplode() {
    if (this.isMuted) return;
    try {
      const ctx = this.initCtx();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(35, t + 0.35);
      gain.gain.setValueAtTime(0.5 * this.volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.35);
    } catch (err) {
      console.warn(err);
    }
  }

  // --- 2048 SFX ---
  public play2048Merge(level: number) {
    if (this.isMuted) return;
    try {
      const ctx = this.initCtx();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const baseFreq = Math.min(1600, 220 + level * 65);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, t + 0.1);
      gain.gain.setValueAtTime(0.3 * this.volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    } catch (err) {
      console.warn(err);
    }
  }

  // --- FLAPPY SFX ---
  public playFlap() {
    if (this.isMuted) return;
    try {
      const ctx = this.initCtx();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(640, t + 0.07);
      gain.gain.setValueAtTime(0.3 * this.volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    } catch (err) {
      console.warn(err);
    }
  }

  // --- CARO SFX ---
  public playCaroPlace(isPlayer: boolean) {
    if (this.isMuted) return;
    try {
      const ctx = this.initCtx();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isPlayer ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(isPlayer ? 587.33 : 440, t);
      gain.gain.setValueAtTime(0.35 * this.volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.14);
    } catch (err) {
      console.warn(err);
    }
  }

  // --- VICTORY FANFARE ---
  public playFanfare() {
    if (this.isMuted) return;
    try {
      const ctx = this.initCtx();
      const t = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + idx * 0.1);
        gain.gain.setValueAtTime(0.3 * this.volume, t + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.1 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + idx * 0.1);
        osc.stop(t + idx * 0.1 + 0.25);
      });
    } catch (err) {
      console.warn(err);
    }
  }
}

export const sound = new SoundController();
