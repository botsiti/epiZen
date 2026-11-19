export interface Appearance { surface: 'solid' | 'glass'; opacity: number; motion: boolean; wallpaper?: string; wallpaperStill?: boolean }
export function appearanceSettings(value: unknown): Appearance {
  const saved = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { surface: saved.surface === 'glass' ? 'glass' : 'solid', opacity: typeof saved.opacity === 'number' && Number.isFinite(saved.opacity) ? Math.max(.45, Math.min(.95, saved.opacity)) : .72, motion: saved.motion === true,
    ...(typeof saved.wallpaper === 'string' && /^[a-f0-9]{64}--[^/\\\p{Cc}]{1,160}\.(?:gif|jpg|png|webp|mp4|mov)$/u.test(saved.wallpaper) ? { wallpaper: saved.wallpaper } : {}),
    ...(saved.wallpaperStill === true ? { wallpaperStill: true } : {}) };
}
