import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { spikeFrame, spikeLook, type SpikeState } from '../../lib/assistant/spike';
import './spike.css';

interface Props { state?: SpikeState; size?: number; followPointer?: boolean; motion?: boolean; className?: string }
export function Spike({ state = 'idle', size = 96, followPointer = false, motion = true, className = '' }: Props) {
  const element = useRef<HTMLSpanElement>(null);
  const [frame, setFrame] = useState({ column: 0, row: 0 });
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animation = 0, started = performance.now();
    let pointer: { x: number; y: number } | undefined;
    const move = (event: PointerEvent) => { pointer = { x: event.clientX, y: event.clientY }; };
    const leave = () => { pointer = undefined; };
    const update = (time: number) => {
      const still = reduced.matches || !motion;
      let next = spikeFrame(still ? 'idle' : state, still ? 0 : time - started);
      if (followPointer && state === 'idle' && pointer && !still && element.current) {
        const rect = element.current.getBoundingClientRect();
        next = spikeLook(pointer.x - rect.left - rect.width / 2, pointer.y - rect.top - rect.height / 2) ?? next;
      }
      setFrame((previous) => previous.column === next.column && previous.row === next.row ? previous : next);
      if (!still) animation = requestAnimationFrame(update);
    };
    const restart = () => { cancelAnimationFrame(animation); started = performance.now(); update(started); };
    restart();
    reduced.addEventListener('change', restart);
    if (followPointer) { window.addEventListener('pointermove', move); document.addEventListener('pointerleave', leave); }
    return () => { cancelAnimationFrame(animation); reduced.removeEventListener('change', restart); window.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', leave); };
  }, [state, followPointer, motion]);
  const style = { width: size, height: size * 208 / 192, '--spike-x': `${frame.column / 7 * 100}%`, '--spike-y': `${frame.row / 10 * 100}%` } as CSSProperties;
  return <span ref={element} className={`spike-sprite ${className}`} style={style} aria-hidden="true" data-state={state} />;
}
