import { useEffect, useState } from 'react';

/** Cards or rows put on the page at once: a few screens' worth. */
const FIRST = 36;
/** And how many more after each frame, until all of them are there. */
const STEP = 48;

/**
 * How many of `total` cards or rows to put on the page: the first few screens at once, then more
 * after each frame until all of them are there. WebKit spends about 0.4 ms on each card it is
 * handed, drawn or not, so 600 at once held the library's first frame for a third of a second;
 * in batches it shows at once and fills in below the fold within a few frames.
 */
export function useInBatches(total: number): number {
  const [count, setCount] = useState(FIRST);
  useEffect(() => {
    if (count >= total) return;
    let done = false;
    const more = () => {
      if (done) return;
      done = true;
      setCount((shown) => shown + STEP);
    };
    // After the frame that drew the last batch; a timer too, for a window that isn't drawing.
    const frame = requestAnimationFrame(() => setTimeout(more, 0));
    const timer = setTimeout(more, 100);
    return () => {
      done = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [count, total]);
  return Math.min(count, total);
}
