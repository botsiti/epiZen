import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { still } from './effects';

// Small moves for the periodic pages, written here without dependencies after ideas from
// react-bits (CountUp, BlurText, ClickSpark, SpotlightCard). Each does nothing but its end state
// when the system asks for reduced motion, or when the e2e run turns motion off.


/** Ease-out with a long, soft landing, like a spring that doesn't overshoot. */
const drift = (t: number) => 1 - Math.pow(1 - t, 4);

/** A number that counts up to its value when it first shows, and glides to each new value. */
export function CountUp({ value, format = (n) => String(Math.round(n)), ms = 1100 }: { value: number; format?: (n: number) => string; ms?: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (still()) {
      from.current = value;
      return;
    }
    const start = from.current;
    const began = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - began) / ms);
      const next = start + (value - start) * drift(t);
      from.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value, ms]);
  return <span className="count">{format(still() ? value : shown)}</span>;
}

/** A sentence that arrives word by word: each fades in, sharpens and rises. */
export function BlurText({ text, className }: { text: string; className?: string }) {
  const words = text.split(/(\s+)/);
  let index = 0;
  return (
    <span className={className ? `blur-text ${className}` : 'blur-text'} aria-label={text}>
      {words.map((word, i) =>
        /^\s+$/.test(word) ? (
          word
        ) : (
          <span key={i} className="blur-word" aria-hidden="true" style={{ '--i': index++ } as CSSProperties}>
            {word}
          </span>
        ),
      )}
    </span>
  );
}
