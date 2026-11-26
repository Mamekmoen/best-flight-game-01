// Every sound is synthesized with WebAudio — no audio files, nothing to load. A two-oscillator
// engine whose pitch follows the throttle, wind noise that follows the speed, and small
// one-shot voices for rings, misses, crashes and the finish. The context stays locked until
// the player's first press, as browsers require; before that, and if anything fails, the
// game is simply silent.

function noiseBuffer(context, seconds) {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let index = 0; index < data.length; index += 1) {
    // Pinkish noise: white noise leaned on its own past, so the wind rumbles instead of hissing.
    const white = Math.random() * 2 - 1;
    last = last * 0.72 + white * 0.28;
    data[index] = last * 2.4;
  }
  return buffer;
}

export function createSound() {
  let context = null;
  let engine = null;
  let wind = null;
  let muted = false;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM') muted = !muted;
  });

  function unlock() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return;
    }
    try {
      context = new window.AudioContext();
      const master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);

      const engineGain = context.createGain();
      engineGain.gain.value = 0;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      const saw = context.createOscillator();
      saw.type = 'sawtooth';
      saw.frequency.value = 52;
      const sub = context.createOscillator();
      sub.type = 'square';
      sub.frequency.value = 26;
      const subGain = context.createGain();
      subGain.gain.value = 0.5;
      saw.connect(engineFilter);
      sub.connect(subGain);
      subGain.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      saw.start();
      sub.start();

      const windSource = context.createBufferSource();
      windSource.buffer = noiseBuffer(context, 2);
      windSource.loop = true;
      const windFilter = context.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 640;
      windFilter.Q.value = 0.7;
      const windGain = context.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSource.start();

      engine = { saw, sub, gain: engineGain, filter: engineFilter, master };
      wind = { gain: windGain, filter: windFilter };
    } catch {
      context = null;
      engine = null;
      wind = null;
    }
  }

  /** Keep the engine and wind matched to the plane, once a frame. */
  function update(throttle, speed, flying) {
    if (!context || !engine || !wind) return;
    const time = context.currentTime;
    const level = muted ? 0 : 1;
    engine.saw.frequency.setTargetAtTime(50 + throttle * 68, time, 0.09);
    engine.sub.frequency.setTargetAtTime(25 + throttle * 34, time, 0.09);
    engine.filter.frequency.setTargetAtTime(320 + throttle * 520, time, 0.12);
    engine.gain.gain.setTargetAtTime(level * (flying || throttle > 0.02 ? 0.05 + throttle * 0.1 : 0.012), time, 0.12);
    wind.gain.gain.setTargetAtTime(level * Math.min(0.16, speed * 0.0022), time, 0.15);
    wind.filter.frequency.setTargetAtTime(420 + speed * 9, time, 0.15);
  }

  function tone(frequency, seconds, type, volume, when = 0, slideTo = 0) {
    if (!context || !engine || muted) return;
    try {
      const at = context.currentTime + when;
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, at);
      if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, at + seconds);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(volume, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, at + seconds);
      oscillator.connect(gain);
      gain.connect(engine.master);
      oscillator.start(at);
      oscillator.stop(at + seconds + 0.05);
    } catch {
      // A failed one-shot is only a missing sound.
    }
  }

  return {
    unlock,
    update,
    /** Two bright notes for a ring threaded. */
    ring() {
      tone(880, 0.16, 'sine', 0.16);
      tone(1318, 0.26, 'sine', 0.14, 0.07);
    },
    /** A low flat note for a ring missed. */
    miss() {
      tone(196, 0.28, 'triangle', 0.14, 0, 155);
    },
    /** A burst and a thud for the end of a flight. */
    crash() {
      tone(90, 0.5, 'sawtooth', 0.22, 0, 34);
      tone(55, 0.7, 'sine', 0.26, 0.02, 28);
    },
    /** A rising run of notes for a finished course. */
    finish() {
      tone(523, 0.16, 'triangle', 0.15);
      tone(659, 0.16, 'triangle', 0.15, 0.11);
      tone(784, 0.2, 'triangle', 0.15, 0.22);
      tone(1046, 0.42, 'triangle', 0.16, 0.33);
    },
  };
}
