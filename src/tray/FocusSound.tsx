import { useEffect, useRef, useState } from 'react';

const SOUNDS = { white: 'White noise', brown: 'Brown noise' } as const;
type Sound = keyof typeof SOUNDS;

function makeLoop(context: AudioContext, sound: Sound) {
  const rate = context.sampleRate;
  const length = rate * 8;
  const overlap = Math.round(rate * 0.05);
  const buffer = context.createBuffer(1, length, rate);
  const samples = buffer.getChannelData(0);
  let low = 0;
  for (let index = 0; index < length + overlap; index += 1) {
    const white = Math.random() * 2 - 1;
    low = (low + 0.025 * white) / 1.025;
    const sample = sound === 'white' ? white * 0.36 : low * 3;
    if (index < length) samples[index] = sample;
    else {
      // Blend the continuation back into the start to avoid a click at the loop point.
      const start = index - length;
      const mix = start / overlap;
      samples[start] = sample * (1 - mix) + samples[start]! * mix;
    }
  }
  return buffer;
}

interface Playback {
  sound: Sound;
  context: AudioContext;
  gain: GainNode;
}

function close(playback: Playback) {
  void playback.context.close().catch(() => undefined);
}

/** This component stays mounted while the tray window is hidden, so the loop keeps playing. */
export function FocusSound({ expanded }: { expanded: boolean }) {
  const playback = useRef<Playback>(undefined);
  const [playing, setPlaying] = useState<Sound>();
  const [problem, setProblem] = useState<string>();
  const [volume, setVolume] = useState(35);
  useEffect(() => () => {
    if (playback.current) {
      close(playback.current);
      playback.current = undefined;
    }
  }, []);

  async function toggle(sound: Sound) {
    setProblem(undefined);
    const previous = playback.current;
    if (previous) close(previous);
    playback.current = undefined;
    setPlaying(undefined);
    if (previous?.sound === sound) return;

    let context: AudioContext | undefined;
    let next: Playback | undefined;
    try {
      context = new AudioContext();
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(context.destination);
      next = { context, gain, sound };
      playback.current = next;

      const source = context.createBufferSource();
      source.buffer = makeLoop(context, sound);
      source.loop = true;
      source.connect(gain);
      source.start();
      gain.gain.setTargetAtTime((volume / 100) ** 2, context.currentTime, 0.03);
      // Request playback in the click handler, while WebKit has the user gesture.
      await context.resume();
      if (playback.current === next) setPlaying(sound);
    } catch {
      if (playback.current === next) {
        if (context) void context.close().catch(() => undefined);
        playback.current = undefined;
        setProblem('Sound couldn’t start. Try again.');
      }
    }
  }

  return (
    <div className="tray-sounds" id="tray-sounds" hidden={!expanded}>
      <div className="tray-sound-controls" role="group" aria-label="Focus sounds">
        {(Object.keys(SOUNDS) as Sound[]).map((sound) => (
          <button key={sound} type="button" className="tray-button" aria-pressed={playing === sound} onClick={() => void toggle(sound)}>
            {SOUNDS[sound]}
          </button>
        ))}
        <input
          className="tray-volume"
          type="range"
          aria-label="Sound volume"
          min={0}
          max={100}
          value={volume}
          onChange={(event) => {
            const level = Number(event.target.value);
            setVolume(level);
            const active = playback.current;
            if (active) active.gain.gain.setTargetAtTime((level / 100) ** 2, active.context.currentTime, 0.03);
          }}
        />
      </div>
      {problem && <p className="tray-sound-error" role="status">{problem}</p>}
    </div>
  );
}
