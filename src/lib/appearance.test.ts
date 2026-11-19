import { expect, it } from 'vitest';
import { appearanceSettings } from './appearance';
it('uses solid defaults and bounds malformed opacity settings', () => {
  expect(appearanceSettings(undefined)).toEqual({ surface: 'solid', opacity: .72, motion: false });
  expect(appearanceSettings({ surface: 'glass', opacity: 0, motion: true })).toEqual({ surface: 'glass', opacity: .45, motion: true });
  expect(appearanceSettings({ opacity: NaN }).opacity).toBe(.72);
});

it('restores a library wallpaper and still-mode preference, rejecting external locations', () => {
  const wallpaper = '4'.repeat(64) + '--Northern sky.gif';
  expect(appearanceSettings({ surface:'glass', wallpaper, wallpaperStill:true })).toMatchObject({ wallpaper, wallpaperStill:true });
  for (const invalid of ['file:///private/image.gif', '../image.gif', 'https://example.com/movie.mp4', '4'.repeat(64) + '--../a.gif']) {
    expect(appearanceSettings({ wallpaper:invalid }).wallpaper).toBeUndefined();
  }
});

it('restores valid custom palettes and falls back for malformed and obsolete entries', () => {
  const palette = { name: 'Midnight', background:'#141526', surface:'#20253a', text:'#eceeff', accent:'#a2bcff' };
  const saved = appearanceSettings({ theme: 'Midnight', customThemes: [{}, { ...palette, name: 'Gruvbox' }, palette, palette] });
  expect(saved.customThemes).toEqual([palette]);
  expect(saved.theme).toBe('Midnight');
  expect(appearanceSettings({ theme: 'Removed' }).theme).toBeUndefined();
  expect(appearanceSettings({ theme: 'Gruvbox' }).theme).toBe('Gruvbox');
  for (const accent of ['red', 'url(https://example.invalid)', '#aabbcc99', '#1a1a1a']) {
    expect(appearanceSettings({ customThemes: [{ ...palette, accent }] }).customThemes).toBeUndefined();
  }
});
