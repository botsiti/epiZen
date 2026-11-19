import { afterEach, expect, it, vi } from 'vitest';
import { getAppearance, onAppearanceChanged } from '../../lib/api';
import { defaultTheme } from '../../lib/colorThemes';
import { applyColorTheme, followWindowTheme } from './windowTheme';

vi.mock('../../lib/api', () => ({ getAppearance: vi.fn(), onAppearanceChanged: vi.fn() }));

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  applyColorTheme(defaultTheme);
  vi.clearAllMocks();
});

it('takes a newer palette change over a delayed initial read in the tray or capture windows', async () => {
  let initial!: (value: unknown) => void, update!: (value: unknown) => void;
  vi.mocked(getAppearance).mockImplementation(() => new Promise((resolve) => { initial = resolve; }));
  const stop = vi.fn();
  vi.mocked(onAppearanceChanged).mockImplementation((callback) => { update = callback; return Promise.resolve(stop); });
  const started = followWindowTheme();
  await vi.waitFor(() => expect(getAppearance).toHaveBeenCalled());
  update({ theme: 'Gruvbox' }); initial({ theme: 'Nord' });
  await started;
  expect(document.documentElement.style.getPropertyValue('--palette-accent')).toBe('#fe8019');
  update({});
  expect(document.documentElement.dataset.colorTheme).toBe('Epizen');
  expect(document.documentElement.style.getPropertyValue('--palette-accent')).toBe('');
  window.dispatchEvent(new Event('pagehide'));
  expect(stop).toHaveBeenCalledOnce();
});
