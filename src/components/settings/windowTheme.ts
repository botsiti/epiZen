import { getAppearance, onAppearanceChanged } from '../../lib/api';
import { appearanceSettings } from '../../lib/appearance';
import { defaultTheme, selectedTheme, themeRgb, type ColorTheme } from '../../lib/colorThemes';

export function applyColorTheme(theme: ColorTheme) {
  const root = document.documentElement;
  root.dataset.colorTheme = theme.name;
  const tokens = {
    '--palette-bg': theme.background, '--palette-surface': theme.surface,
    '--palette-text': theme.text, '--palette-accent': theme.accent,
    '--accent-rgb': themeRgb(theme.accent).join(' '),
  };
  for (const [key, value] of Object.entries(tokens)) {
    if (theme === defaultTheme) root.style.removeProperty(key);
    else root.style.setProperty(key, value);
  }
}

// Auxiliary webviews need only appearance, including when opened after a settings change.
export async function followWindowTheme() {
  let changed = false;
  const apply = (value: unknown) => {
    const appearance = appearanceSettings(value);
    applyColorTheme(selectedTheme(appearance.theme, appearance.customThemes));
  };
  const unlisten = await onAppearanceChanged((value) => { changed = true; apply(value); });
  window.addEventListener('pagehide', unlisten, { once: true });
  const initial = await getAppearance();
  if (!changed) apply(initial);
}
