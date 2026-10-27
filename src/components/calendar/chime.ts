// A soft chime at the end of a focus round and of a rest, made with Web Audio: a few sine
// notes with a faint overtone, each fading out like a small bell. No sound files.

let context: AudioContext | undefined;

function audio(): AudioContext | undefined {
  if (typeof AudioContext === 'undefined') return undefined;
  context ??= new AudioContext();
  void context.resume().catch(() => undefined);
  return context;
}

/** Wakes the audio up from a click, so the chime can sound later when nothing is clicked. */
export function primeChime() {
  try {
    audio();
  } catch {
    // No audio here: the dial still shows the end.
  }
}

// Rising for the end of a round (E5, A5, E6), falling back for the end of a rest (A5, E5).
const NOTES = { focus: [659.25, 880, 1318.5], rest: [880, 659.25] };

export function chime(kind: 'focus' | 'rest') {
  try {
    const ctx = audio();
    if (!ctx) return;
    const begin = ctx.currentTime + 0.03;
    NOTES[kind].forEach((frequency, i) => {
      const at = begin + i * 0.17;
      for (const [overtone, level] of [
        [1, 0.08],
        [2.01, 0.018],
      ] as const) {
        const tone = ctx.createOscillator();
        const gain = ctx.createGain();
        tone.type = 'sine';
        tone.frequency.value = frequency * overtone;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(level, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.9);
        tone.connect(gain).connect(ctx.destination);
        tone.start(at);
        tone.stop(at + 2);
      }
    });
  } catch {
    // As above: silence rather than a crash.
  }
}
