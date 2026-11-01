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

let lightFrame: number | undefined;
let lightTarget: { card: HTMLElement; x: number; y: number } | undefined;

/** Coalesce pointer updates to one measurement and paint per frame. */
export function followPointer(event: PointerEvent<HTMLElement>) {
  if (still()) return;
  const card = (event.target as Element).closest<HTMLElement>('.glass');
  if (!card) return;
  lightTarget = { card, x: event.clientX, y: event.clientY };
  if (lightFrame !== undefined) return;
  lightFrame = requestAnimationFrame(() => {
    lightFrame = undefined;
    const target = lightTarget;
    lightTarget = undefined;
    if (!target?.card.isConnected || still()) return;
    const box = target.card.getBoundingClientRect();
    target.card.style.setProperty('--mx', `${target.x - box.left}px`);
    target.card.style.setProperty('--my', `${target.y - box.top}px`);
  });
}

/** The entrance order of a card, for its staggered rise. */
export const order = (i: number) => ({ '--i': i }) as CSSProperties;
