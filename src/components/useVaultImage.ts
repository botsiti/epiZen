import { useEffect, useState } from 'react';
import { readImage } from '../lib/api';

const MIME: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** An image from the vault, read through the backend as a blob URL. `undefined` while it loads or until `ready`. */
export function useVaultImage(path: string | undefined, ready = true): { url?: string; failed?: boolean } {
  const [image, setImage] = useState<{ path?: string; url?: string; failed?: boolean }>({ path });

  useEffect(() => {
    if (!path || !ready) return;
    let cancelled = false;
    let url: string | undefined;
    const type = MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
    readImage(path)
      .then((bytes) => {
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([bytes], { type }));
        setImage({ path, url });
      })
      .catch(() => {
        if (!cancelled) setImage({ path, failed: true });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path, ready]);

  return image.path === path ? { url: image.url, failed: image.failed } : {};
}
