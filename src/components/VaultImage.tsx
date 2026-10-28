import { useEffect, useRef, useState } from 'react';
import { useVaultImage } from './useVaultImage';

interface Props {
  path: string;
  alt: string;
  width?: number;
  className?: string;
  /** Read the image only once it scrolls near the view, for long grids of covers. */
  lazy?: boolean;
}

/** How far outside the view an image counts as near, so it is read before it scrolls in. */
const NEAR = '600px';

interface Watcher {
  observer: IntersectionObserver;
  /** What each element still waited on does once it comes near. */
  waiting: Map<Element, Set<() => void>>;
}

/**
 * One observer for every lazy image in a scrolling pane, not one each: a library of 600 covers
 * otherwise keeps 600 observers that WebKit checks on every frame of a scroll.
 */
const watchers = new Map<Element | null, Watcher>();

function unwatch(root: Element | null, watcher: Watcher, element: Element, near?: () => void) {
  const waiting = watcher.waiting.get(element);
  if (near) waiting?.delete(near);
  if (!near || !waiting?.size) {
    watcher.waiting.delete(element);
    watcher.observer.unobserve(element);
  }
  // The last one gone, the observer goes too, and nothing holds on to a pane that was closed.
  if (!watcher.waiting.size && watchers.get(root) === watcher) {
    watcher.observer.disconnect();
    watchers.delete(root);
  }
}

/** Calls `near` once the element comes within NEAR of the view. Returns what stops waiting. */
function whenNear(element: Element, near: () => void): () => void {
  // The main pane scrolls, not the window: measured against it, an image a screen below counts as near.
  const root = element.closest('.main');
  let watcher = watchers.get(root);
  if (!watcher) {
    const waiting = new Map<Element, Set<() => void>>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const done = entry.isIntersecting ? waiting.get(entry.target) : undefined;
          if (!done) continue;
          unwatch(root, created, entry.target);
          for (const call of done) call();
        }
      },
      { root, rootMargin: NEAR },
    );
    const created: Watcher = { observer, waiting };
    watcher = created;
    watchers.set(root, created);
  }
  const mine = watcher;
  const waiting = mine.waiting.get(element);
  if (waiting) waiting.add(near);
  else {
    mine.waiting.set(element, new Set([near]));
    mine.observer.observe(element);
  }
  return () => {
    if (mine.waiting.get(element)?.has(near)) unwatch(root, mine, element, near);
  };
}

/** True once the element has come within a screen of the view (at once where that can't be told). */
function useNearView(on: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(!on || typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (near || !ref.current) return;
    return whenNear(ref.current, () => setNear(true));
  }, [near]);
  return { ref, near };
}

/** An image from the vault, read through the backend and shown from a blob URL. */
export function VaultImage({ path, alt, width, className = 'embed', lazy = false }: Props) {
  const { ref, near } = useNearView(lazy);
  const image = useVaultImage(path, near);

  if (image.failed) {
    return <span className="embed-missing">{alt}</span>;
  }
  if (!image.url) {
    return <span ref={ref} className={`${className} embed-loading`} style={{ width, aspectRatio: '1' }} />;
  }
  return <img className={className} src={image.url} alt={alt} width={width} data-testid="vault-image" />;
}
