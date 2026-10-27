import { useEffect, useState } from 'react';

/** The time now, in milliseconds, kept current every `every` ms while `active`. */
export function useNow(active: boolean, every: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const update = () => setNow(Date.now());
    const first = setTimeout(update, 0);
    const timer = setInterval(update, every);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [active, every]);
  return now;
}
