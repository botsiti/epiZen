import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Wallpaper } from '../../lib/api';
import './wallpaper.css';

function subscribe(notify: () => void) {
  if (!window.matchMedia) return () => {};
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const transparent = window.matchMedia('(prefers-reduced-transparency: reduce)');
  reduced.addEventListener('change', notify); transparent.addEventListener('change', notify);
  window.addEventListener('focus', notify); window.addEventListener('blur', notify);
  document.addEventListener('visibilitychange', notify);
  return () => {
    reduced.removeEventListener('change', notify); transparent.removeEventListener('change', notify);
    window.removeEventListener('focus', notify); window.removeEventListener('blur', notify);
    document.removeEventListener('visibilitychange', notify);
  };
}
const playbackAllowed = () => typeof window.matchMedia === 'function' && document.hasFocus() && !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  && !window.matchMedia('(prefers-reduced-transparency: reduce)').matches;

/** Canvas samples the default frame of an animated image. A CSS animation pause cannot freeze a GIF. */
function StillImage({ item, thumbnail, onError }: { item: Wallpaper; thumbnail: boolean; onError: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const canvas = ref.current;
      if (!canvas) return;
      const scale = Math.min(1, (thumbnail ? 420 : 3840) / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (context) context.drawImage(img, 0, 0, canvas.width, canvas.height);
      else onError();
    };
    img.onerror = onError; img.src = item.url;
    return () => { img.onload = null; img.onerror = null; img.removeAttribute('src'); };
  }, [item.url, thumbnail, onError]);
  return <canvas ref={ref} aria-hidden="true" />;
}

export function WallpaperMedia({ item, moving = false, thumbnail = false }: { item: Wallpaper; moving?: boolean; thumbnail?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let active = true;
    if (moving) void element.play().catch((error: unknown) => { if (active && error instanceof DOMException && error.name === 'NotSupportedError') fail(); });
    else element.pause();
    return () => { active = false; };
  }, [moving, item.url, fail]);
  if (failed) return <span className="wallpaper-unavailable">Preview unavailable</span>;
  if (item.kind === 'video') return <video ref={video} src={item.url + '#t=0.001'} muted playsInline loop preload={thumbnail ? 'metadata' : 'auto'} onError={fail} />;
  if (item.kind === 'gif' && moving) return <img src={item.url} alt="" onError={fail} />;
  return <StillImage item={item} thumbnail={thumbnail} onError={fail} />;
}

export function LiveWallpaper({ item, still, preview = false }: { item: Wallpaper; still?: boolean; preview?: boolean }) {
  const active = useSyncExternalStore(subscribe, playbackAllowed, () => false);
  return <span className={preview ? 'wallpaper-preview-media' : 'workspace-wallpaper'} aria-hidden="true">
    <WallpaperMedia key={item.id} item={item} moving={active && !still} thumbnail={preview} />
  </span>;
}
