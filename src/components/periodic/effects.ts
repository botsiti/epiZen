import type { CSSProperties, PointerEvent } from 'react';

// The non-component half of the periodic pages' motion (motion.tsx has the components).

/** True when motion should only show its end state: reduced motion, or the e2e run's `data-motion="off"`. */
export const still = () =>
  document.documentElement.dataset.motion === 'off' || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** A burst of short lines from where a box was ticked. */
export function spark(x: number, y: number, color: string) {
  if (still()) return;
  const burst = document.createElement('span');
  burst.className = 'spark';
  burst.style.left = `${x}px`;
  burst.style.top = `${y}px`;
  burst.style.setProperty('--spark', color);
  for (let i = 0; i < 8; i += 1) {
    const ray = document.createElement('span');
    ray.style.setProperty('--a', `${i * 45 + 22.5}deg`);
    burst.append(ray);
  }
  document.body.append(burst);
  setTimeout(() => burst.remove(), 700);
}

/** Where the pointer is over a card, for the soft light that follows it (`.glass::before`). */
export function followPointer(event: PointerEvent<HTMLElement>) {
  const card = (event.target as Element).closest<HTMLElement>('.glass');
  if (!card) return;
  const box = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${event.clientX - box.left}px`);
  card.style.setProperty('--my', `${event.clientY - box.top}px`);
}

/** The entrance order of a card, for its staggered rise. */
export const order = (i: number) => ({ '--i': i }) as CSSProperties;
