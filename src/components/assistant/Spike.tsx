import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { spikeFrame, spikeFrameDelay, spikeLook, type SpikeState } from '../../lib/assistant/spike';
import './spike.css';

interface Props { state?: SpikeState; size?: number; followPointer?: boolean; motion?: boolean; className?: string }
export function Spike({ state = 'idle', size = 96, followPointer = false, motion = true, className = '' }: Props) {
  const element = useRef<HTMLSpanElement>(null);
  const [frame, setFrame] = useState({ column: 0, row: 0 });
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer: ReturnType<typeof setTimeout> | undefined, animation = 0, started = performance.now();
    let look: ReturnType<typeof spikeLook>;
    const update = () => {
      clearTimeout(timer);
      const still = reduced.matches || !motion || document.hidden;
      const elapsed = performance.now() - started;
      const next = still ? spikeFrame('idle', 0) : look ?? spikeFrame(state, elapsed);
      setFrame((previous) => previous.column === next.column && previous.row === next.row ? previous : next);
      // The atlas changes about seven times per second. Don't wake React at the display's 60–120 Hz.
      if (!still && !look) timer = setTimeout(update, spikeFrameDelay(state, elapsed));
    };
    const move = (event: PointerEvent) => {
      if (state !== 'idle' || !motion || reduced.matches || document.hidden || !element.current) return;
      const rect = element.current.getBoundingClientRect();
      look = spikeLook(event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
      if (!animation) animation = requestAnimationFrame(() => { animation = 0; update(); });
    };
    const leave = () => { look = undefined; update(); };
    const restart = () => { cancelAnimationFrame(animation); animation = 0; look = undefined; started = performance.now(); update(); };
    restart();
    reduced.addEventListener('change', restart);
    document.addEventListener('visibilitychange', restart);
    if (followPointer) { window.addEventListener('pointermove', move); document.addEventListener('pointerleave', leave); }
    return () => { clearTimeout(timer); cancelAnimationFrame(animation); reduced.removeEventListener('change', restart); document.removeEventListener('visibilitychange', restart); window.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', leave); };
  }, [state, followPointer, motion]);
  const style = { width: size, height: size * 208 / 192, '--spike-x': `${frame.column / 7 * 100}%`, '--spike-y': `${frame.row / 10 * 100}%` } as CSSProperties;
  return <span ref={element} className={`spike-sprite ${className}`} style={style} aria-hidden="true" data-state={state} />;
}
