import type { Wallpaper } from '../../lib/api';

/** WebKit owns codec support. Check the first frame before replacing the user's saved backdrop. */
export function checkWallpaper(item: Wallpaper): Promise<void> {
  return new Promise((resolve, reject) => {
    const element = item.kind === 'video' ? document.createElement('video') : new Image();
    const ready = item.kind === 'video' ? 'loadeddata' : 'load';
    const finish = (error?: string) => {
      clearTimeout(timer);
      element.removeEventListener(ready, loaded); element.removeEventListener('error', failed);
      element.removeAttribute('src');
      if (element instanceof HTMLVideoElement) element.load();
      if (error) reject(new Error(error)); else resolve();
    };
    const loaded = () => finish();
    const failed = () => finish('This wallpaper could not be decoded. Choose a different image or movie.');
    const timer = setTimeout(() => finish('This wallpaper did not load. Try again or choose another file.'), 15000);
    element.addEventListener(ready, loaded); element.addEventListener('error', failed);
    if (element instanceof HTMLVideoElement) { element.preload = 'auto'; element.muted = true; element.playsInline = true; }
    element.src = item.url;
  });
}
