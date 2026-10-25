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

interface Props {
  path: string;
  alt: string;
  width?: number;
  className?: string;
}

/** An image from the vault, read through the backend and shown from a blob URL. */
export function VaultImage({ path, alt, width, className = 'embed' }: Props) {
  const [image, setImage] = useState<{ path: string; url?: string; failed?: boolean }>({ path });

  useEffect(() => {
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
  }, [path]);

  if (image.path === path && image.failed) {
    return <span className="embed-missing">{alt}</span>;
  }
  if (image.path !== path || !image.url) {
    return <span className={`${className} embed-loading`} style={{ width, aspectRatio: '1' }} />;
  }
  return <img className={className} src={image.url} alt={alt} width={width} data-testid="vault-image" />;
}
