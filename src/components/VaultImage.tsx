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

/** True once the element has come within a screen of the view (at once where that can't be told). */
function useNearView(on: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(!on || typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (near || !ref.current) return;
    // The main pane scrolls, not the window: measured against it, a cover a screen below counts as near.
    const root = ref.current.closest('.main');
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && setNear(true), { root, rootMargin: '600px' });
    observer.observe(ref.current);
    return () => observer.disconnect();
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
