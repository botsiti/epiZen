// Only opaque sRGB literals cross from imported JSON into native chrome and CSS.
export interface ColorTheme {
  name: string;
  background: string;
  surface: string;
  text: string;
  accent: string;
}

function palette(name: string, background: string, surface: string, text: string, accent: string): ColorTheme {
  return { name, background, surface, text, accent };
}

export const colorThemes = [
  palette('Epizen', '#121416', '#171a1d', '#e7e5e0', '#8fbcaa'),
  palette('Ocean', '#111922', '#1d2a37', '#daebf5', '#77bcdf'),
  palette('Ember', '#201915', '#302620', '#eee3d8', '#eeab7b'),
  palette('Iris', '#181621', '#282433', '#eae4f5', '#bda2ee'),
  palette('Rose', '#20171b', '#30232b', '#f4e3e7', '#e9a9b6'),
  palette('Graphite', '#191a1b', '#292b2e', '#e6e7e9', '#b8c2ce'),
  palette('Catppuccin Mocha', '#181825', '#262637', '#cdd6f4', '#cba6f7'),
  palette('Tokyo Night', '#16161e', '#1f2335', '#c0caf5', '#7aa2f7'),
  palette('Nord', '#2a303b', '#434c5e', '#eceff4', '#88c0d0'),
  palette('Dracula', '#1e1f29', '#303241', '#f8f8f2', '#bd93f9'),
  palette('Rosé Pine', '#191724', '#26233a', '#e0def4', '#c4a7e7'),
  palette('One Dark', '#1e2227', '#2c313a', '#e6e6e6', '#61afef'),
  palette('GitHub Dark', '#0d1117', '#1c2128', '#f0f6fc', '#58a6ff'),
  palette('Gruvbox', '#1d2021', '#32302f', '#fbf1c7', '#fe8019'),
  palette('Solarized Dark', '#002731', '#0b3d4a', '#fdf6e3', '#268bd2'),
  palette('Monokai', '#22231e', '#2f302a', '#f8f8f2', '#f92672'),
  palette('Night Owl', '#011221', '#0b2942', '#ffffff', '#82aaff'),
  palette('Palenight', '#202331', '#2f3447', '#ffffff', '#c792ea'),
  palette('Ayu Mirage', '#1a1f29', '#242936', '#f3f4f0', '#ffa759'),
  palette('Everforest', '#232a2e', '#343f44', '#e6dcc0', '#a7c080'),
  palette('Kanagawa', '#1a1a22', '#2a2a37', '#e6e1c8', '#7e9cd8'),
  palette('Cobalt2', '#122738', '#1f4662', '#ffffff', '#0088ff'),
  palette("SynthWave '84", '#1e1a2b', '#2a2139', '#ffffff', '#ff7edb'),
  palette('Matrix', '#000500', '#041406', '#d4ffd4', '#00ff41'),
];
export const defaultTheme = colorThemes[0]!;

export function themeRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function luminance(color: string) {
  const [r, g, b] = themeRgb(color).map((v) => v <= 10 ? v / 3294.6 : ((v / 255 + .055) / 1.055) ** 2.4);
  return r! * .2126 + g! * .7152 + b! * .0722;
}

function customTheme(value: unknown): ColorTheme {
  if (!value || typeof value !== 'object') throw new Error('Paste a theme JSON object.');
  const { name, background, surface, text, accent } = value as Record<string, unknown>;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 48 || /\p{C}/u.test(name))
    throw new Error('Give your theme a name of 1–48 characters.');
  const hex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  if (!hex(background) || !hex(surface) || !hex(text) || !hex(accent))
    throw new Error('Use six-digit hex colors for background, surface, text and accent.');
  const panel = Math.max(luminance(background), luminance(surface));
  if ((luminance(text) + .05) / (panel + .05) < 4.5 || (luminance(accent) + .05) / (panel + .05) < 3)
    throw new Error('Use lighter text and accent colors for legibility on both dark surfaces.');
  return palette(name.trim(), background, surface, text, accent);
}

export function importTheme(source: string): ColorTheme {
  if (source.length > 4096) throw new Error('Keep the palette under 4,096 characters.');
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { throw new Error('Paste valid JSON with a name and four colors.'); }
  return customTheme(parsed);
}

export function readCustomThemes(value: unknown): ColorTheme[] {
  const themes: ColorTheme[] = [];
  const names = new Set(colorThemes.map((theme) => theme.name.toLowerCase()));
  if (Array.isArray(value)) for (const entry of value.slice(0, 32)) {
    try {
      const theme = customTheme(entry), name = theme.name.toLowerCase();
      if (!names.has(name)) { names.add(name); themes.push(theme); }
    } catch { /* An invalid saved palette must not prevent startup. */ }
  }
  return themes;
}

export function selectedTheme(name?: string, custom: readonly ColorTheme[] = []) {
  return colorThemes.find((item) => item.name === name) ?? custom.find((item) => item.name === name) ?? defaultTheme;
}
