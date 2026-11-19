import { useEffect, useState } from 'react';
import { chooseWallpaper, listWallpapers, removeWallpaper, type Wallpaper } from '../../lib/api';

export interface WallpaperLibrary {
  items: Wallpaper[]; loading: boolean; error?: string;
  retry: () => void;
  add: () => Promise<Wallpaper | undefined>;
  remove: (id: string) => Promise<void>;
}

/** The library is app-wide. Appearance holds only the chosen media ID. */
export function useWallpapers(open: boolean, onRemoved: (id: string) => void): WallpaperLibrary {
  const [items, setItems] = useState<Wallpaper[]>([]), [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0), [loaded, setLoaded] = useState(-1);
  useEffect(() => {
    if (!open) return;
    let current = true;
    void listWallpapers().then((next) => {
      if (current) { setItems(next); setError(undefined); setLoaded(revision); }
    }).catch((error: unknown) => {
      if (current) { setError(String(error)); setLoaded(revision); }
    });
    return () => { current = false; };
  }, [open, revision]);
  return { items, loading: loaded !== revision, error, retry: () => setRevision((n) => n + 1),
    add: async () => {
      const chosen = await chooseWallpaper();
      if (chosen) setItems((prev) => prev.some((item) => item.id === chosen.id) ? prev : [...prev, chosen].sort((a, b) => a.name.localeCompare(b.name)));
      return chosen;
    },
    remove: async (id) => {
      await removeWallpaper(id);
      setItems((prev) => prev.filter((item) => item.id !== id)); onRemoved(id);
    },
  };
}
