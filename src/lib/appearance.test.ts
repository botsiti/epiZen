import { expect, it } from 'vitest';
import { appearanceSettings } from './appearance';
it('uses solid defaults and bounds malformed opacity settings', () => {
  expect(appearanceSettings(undefined)).toEqual({ surface: 'solid', opacity: .72, motion: false });
  expect(appearanceSettings({ surface: 'glass', opacity: 0, motion: true })).toEqual({ surface: 'glass', opacity: .45, motion: true });
  expect(appearanceSettings({ opacity: NaN }).opacity).toBe(.72);
});
