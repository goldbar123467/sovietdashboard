// ---------------------------------------------------------------------------
// DOUGHBOY — Procedural Audio Manager
// All sounds generated via Web Audio API oscillators and noise buffers.
// No external audio files or libraries.
// ---------------------------------------------------------------------------

export interface AudioManager {
  /** Start audio context (must be called from user gesture) */
  init(): void;
  /** Play a named sound effect */
  play(id: 'chime' | 'wipeout' | 'scrape' | 'shroom' | 'voiceBlip'): void;
  /** Set scooter throttle for engine pitch (0 = idle, 1 = full speed) */
  setThrottle(value: number): void;
  /** Set trip intensity for music pitch-shift (0 = sober, 1 = peak) */
  setTripIntensity(value: number): void;
  /** Start the background lo-fi loop */
  startMusic(): void;
  /** Stop the background lo-fi loop */
  stopMusic(): void;
  /** Clean up all audio resources */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a number between min and max. */
function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Create a mono AudioBuffer filled with white noise. */
function createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAudioManager(): AudioManager {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let initialized = false;

  // Engine state
  let engineOsc1: OscillatorNode | null = null;
  let engineOsc2: OscillatorNode | null = null;
  let engineFilter: BiquadFilterNode | null = null;
  let engineGain: GainNode | null = null;

  // Music state
  let musicOsc: OscillatorNode | null = null;
  let musicFilter: BiquadFilterNode | null = null;
  let musicGain: GainNode | null = null;
  let musicLfo: OscillatorNode | null = null;
  let musicLfoGain: GainNode | null = null;
  let musicPlaying = false;

  // Base frequency of the music oscillator (stored so we can pitch-shift)
  const musicBaseFreq = 150;

  // Flanger state
  let flangerDelay: DelayNode | null = null;
  let flangerLfo: OscillatorNode | null = null;
  let flangerLfoGain: GainNode | null = null;
  let flangerWetGain: GainNode | null = null;

  // Trip intensity
  let _tripIntensity = 0;

  // Cached noise buffers (created once on init)
  let noiseBuffer03: AudioBuffer | null = null; // 0.3s for wipeout
  let noiseBuffer015: AudioBuffer | null = null; // 0.15s for scrape

  // ------------------------------------------
  // init
  // ------------------------------------------
  function init(): void {
    if (initialized) return;

    try {
      ctx = new AudioContext();
    } catch {
      // Environment does not support Web Audio API — degrade silently.
      return;
    }

    ctx.resume().catch(() => {});

    // Master gain
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);

    // Pre-create noise buffers
    noiseBuffer03 = createNoiseBuffer(ctx, 0.3);
    noiseBuffer015 = createNoiseBuffer(ctx, 0.15);

    // Set up engine
    setupEngine();

    initialized = true;
  }

  // ------------------------------------------
  // Engine (runs continuously after init)
  // ------------------------------------------
  function setupEngine(): void {
    if (!ctx || !masterGain) return;

    engineGain = ctx.createGain();
    engineGain.gain.value = 0.15;

    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 200;

    // Fundamental sawtooth
    engineOsc1 = ctx.createOscillator();
    engineOsc1.type = 'sawtooth';
    engineOsc1.frequency.value = 40;

    // Second osc a 5th above
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 60; // perfect 5th of 40Hz

    engineOsc1.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(masterGain);

    engineOsc1.start();
    engineOsc2.start();
  }

  // ------------------------------------------
  // SFX helpers
  // ------------------------------------------

  /** Play a delivery chime — two rising sine tones (C5, E5). */
  function playChime(): void {
    if (!ctx || !masterGain) return;
    const now = ctx.currentTime;

    const tones: [number, number][] = [
      [523, 0],    // C5 at t+0
      [659, 0.1],  // E5 at t+0.1
    ];

    for (const [freq, offset] of tones) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(0.3, now + offset + 0.01); // attack
      gain.gain.linearRampToValueAtTime(0, now + offset + 0.1);    // release

      osc.connect(gain);
      gain.connect(masterGain!);

      osc.start(now + offset);
      osc.stop(now + offset + 0.1);
    }
  }

  /** Play a wipeout crash — bandpass-filtered white noise burst. */
  function playWipeout(): void {
    if (!ctx || !masterGain || !noiseBuffer03) return;
    const now = ctx.currentTime;

    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer03;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.01); // quick attack
    gain.gain.linearRampToValueAtTime(0, now + 0.3);    // fast decay

    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain!);

    source.start(now);
    source.stop(now + 0.3);
  }

  /** Play a scrape — short highpass-filtered noise. */
  function playScrape(): void {
    if (!ctx || !masterGain || !noiseBuffer015) return;
    const now = ctx.currentTime;

    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer015;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
    gain.gain.linearRampToValueAtTime(0, now + 0.15);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain!);

    source.start(now);
    source.stop(now + 0.15);
  }

  /** Play a shroom pickup — rising 3-note arpeggio (A4, C#5, E5). */
  function playShroom(): void {
    if (!ctx || !masterGain) return;
    const now = ctx.currentTime;

    const notes: [number, number][] = [
      [440, 0],      // A4
      [554, 0.06],   // C#5
      [659, 0.12],   // E5
    ];

    for (const [freq, offset] of notes) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(0.25, now + offset + 0.01);
      gain.gain.linearRampToValueAtTime(0, now + offset + 0.08);

      osc.connect(gain);
      gain.connect(masterGain!);

      osc.start(now + offset);
      osc.stop(now + offset + 0.08);
    }
  }

  /** Play a voice blip — quick square wave pulse. */
  function playVoiceBlip(): void {
    if (!ctx || !masterGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 220;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.005);
    gain.gain.linearRampToValueAtTime(0, now + 0.05);

    osc.connect(gain);
    gain.connect(masterGain!);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  // ------------------------------------------
  // Public API
  // ------------------------------------------

  const sfxMap: Record<string, () => void> = {
    chime: playChime,
    wipeout: playWipeout,
    scrape: playScrape,
    shroom: playShroom,
    voiceBlip: playVoiceBlip,
  };

  function play(id: 'chime' | 'wipeout' | 'scrape' | 'shroom' | 'voiceBlip'): void {
    if (!initialized) return;
    const fn = sfxMap[id];
    if (fn) fn();
  }

  function setThrottle(value: number): void {
    if (!initialized || !engineOsc1 || !engineOsc2 || !engineFilter) return;
    const t = clamp(value, 0, 1);

    // Base freq: 40Hz (idle) → 90Hz (full)
    const baseFreq = 40 + t * 50;
    engineOsc1.frequency.value = baseFreq;
    engineOsc2.frequency.value = baseFreq * 1.5; // perfect 5th

    // Low-pass cutoff: 200Hz (idle) → 600Hz (full)
    engineFilter.frequency.value = 200 + t * 400;
  }

  function setTripIntensity(value: number): void {
    _tripIntensity = clamp(value, 0, 1);

    // Pitch-shift: lower music oscillator frequency by up to 10% at peak trip
    if (musicOsc) {
      musicOsc.frequency.value = musicBaseFreq * (1.0 - _tripIntensity * 0.1);
    }

    // Flanger wet/dry mix: 0 at sober, 0.5 at peak trip
    if (flangerWetGain) {
      flangerWetGain.gain.value = _tripIntensity * 0.5;
    }
  }

  function startMusic(): void {
    if (!initialized || !ctx || !masterGain || musicPlaying) return;

    // Sawtooth bass oscillator (apply current trip pitch-shift)
    musicOsc = ctx.createOscillator();
    musicOsc.type = 'sawtooth';
    musicOsc.frequency.value = musicBaseFreq * (1.0 - _tripIntensity * 0.1);

    // Low-pass to soften it
    musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 300;

    // Quiet gain
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.08;

    // LFO for "breathing" modulation on gain
    musicLfo = ctx.createOscillator();
    musicLfo.type = 'sine';
    musicLfo.frequency.value = 0.5;

    musicLfoGain = ctx.createGain();
    musicLfoGain.gain.value = 0.03; // subtle modulation depth

    // LFO → musicGain.gain (modulates volume slightly)
    musicLfo.connect(musicLfoGain);
    musicLfoGain.connect(musicGain.gain);

    // --- Flanger effect ---
    // Delay node with small initial delay (centre of sweep range)
    flangerDelay = ctx.createDelay(0.02);
    flangerDelay.delayTime.value = 0.003; // midpoint of 0.001–0.005s

    // LFO modulates the delay time between 0.001s and 0.005s
    // Centre = 0.003s, amplitude = 0.002s → sweeps 0.001–0.005
    flangerLfo = ctx.createOscillator();
    flangerLfo.type = 'sine';
    flangerLfo.frequency.value = 0.3;

    flangerLfoGain = ctx.createGain();
    flangerLfoGain.gain.value = 0.002; // ±2ms around the 3ms centre

    flangerLfo.connect(flangerLfoGain);
    flangerLfoGain.connect(flangerDelay.delayTime);

    // Wet gain — controlled by trip intensity (0 when sober, 0.5 at peak)
    flangerWetGain = ctx.createGain();
    flangerWetGain.gain.value = _tripIntensity * 0.5;

    // Signal path:
    //   osc → filter → gain (dry) → master
    //                → flangerDelay → flangerWetGain → master
    musicOsc.connect(musicFilter);
    musicFilter.connect(musicGain);
    musicGain.connect(masterGain);

    // Wet path taps after the filter (pre-gain) for cleaner flanging
    musicFilter.connect(flangerDelay);
    flangerDelay.connect(flangerWetGain);
    flangerWetGain.connect(masterGain);

    musicOsc.start();
    musicLfo.start();
    flangerLfo.start();
    musicPlaying = true;
  }

  function stopMusic(): void {
    if (!musicPlaying) return;

    try { musicOsc?.stop(); } catch { /* already stopped */ }
    try { musicLfo?.stop(); } catch { /* already stopped */ }
    try { flangerLfo?.stop(); } catch { /* already stopped */ }

    musicOsc?.disconnect();
    musicFilter?.disconnect();
    musicGain?.disconnect();
    musicLfo?.disconnect();
    musicLfoGain?.disconnect();

    flangerDelay?.disconnect();
    flangerLfo?.disconnect();
    flangerLfoGain?.disconnect();
    flangerWetGain?.disconnect();

    musicOsc = null;
    musicFilter = null;
    musicGain = null;
    musicLfo = null;
    musicLfoGain = null;

    flangerDelay = null;
    flangerLfo = null;
    flangerLfoGain = null;
    flangerWetGain = null;

    musicPlaying = false;
  }

  function dispose(): void {
    stopMusic();

    // Stop engine oscillators
    try { engineOsc1?.stop(); } catch { /* already stopped */ }
    try { engineOsc2?.stop(); } catch { /* already stopped */ }

    engineOsc1?.disconnect();
    engineOsc2?.disconnect();
    engineFilter?.disconnect();
    engineGain?.disconnect();

    engineOsc1 = null;
    engineOsc2 = null;
    engineFilter = null;
    engineGain = null;

    masterGain?.disconnect();
    masterGain = null;

    if (ctx) {
      ctx.close().catch(() => {});
      ctx = null;
    }

    noiseBuffer03 = null;
    noiseBuffer015 = null;
    initialized = false;
    _tripIntensity = 0;
  }

  return {
    init,
    play,
    setThrottle,
    setTripIntensity,
    startMusic,
    stopMusic,
    dispose,
  };
}
