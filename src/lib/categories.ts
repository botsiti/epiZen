/** How a `#daily/<category>` task's minutes count: toward productive time or recovery, and at what XP rate. */
export interface Category {
  name: string;
  color: string;
  kind: 'main' | 'recovery';
  /** XP per logged minute. */
  multiplier: number;
}

// The categories the vault's Obsidian dashboards know (Templates/Scripts/rpg-day.js), in their jewel colours.
const KNOWN: Record<string, Omit<Category, 'name'>> = {
  business: { color: '#e06681', kind: 'main', multiplier: 1 },
  kaizen: { color: '#e06681', kind: 'main', multiplier: 1 },
  code: { color: '#6fa5e6', kind: 'main', multiplier: 1 },
  // Not one of the Obsidian scripts' own: teal, so it reads apart from code's blue in the same chart.
  study: { color: '#52bfc4', kind: 'main', multiplier: 1 },
  biology: { color: '#6fa5e6', kind: 'main', multiplier: 1 },
  math: { color: '#6fa5e6', kind: 'main', multiplier: 1 },
  sport: { color: '#63bd92', kind: 'main', multiplier: 1 },
  meditation: { color: '#63bd92', kind: 'main', multiplier: 5 },
  travel: { color: '#63bd92', kind: 'recovery', multiplier: 1 },
  leisure: { color: '#b48ede', kind: 'recovery', multiplier: 0.5 },
  english: { color: '#9b82e8', kind: 'main', multiplier: 1 },
  book: { color: '#dfa163', kind: 'main', multiplier: 0.5 },
  dog: { color: '#e8734f', kind: 'main', multiplier: 1 },
  cinema: { color: '#dcbc72', kind: 'recovery', multiplier: 0.5 },
};

// Any other category takes one of these, the same one every time.
const PALETTE = ['#6fa5e6', '#63bd92', '#e06681', '#b48ede', '#dcbc72', '#dfa163', '#52bfc4', '#dd8fc0'];

export function category(name: string): Category {
  const known = KNOWN[name.toLowerCase()];
  if (known) return { name, ...known };
  let hash = 0;
  for (const char of name.toLowerCase()) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return { name, color: PALETTE[hash % PALETTE.length] ?? '#8fbcaa', kind: 'main', multiplier: 1 };
}

/** The daily metrics, in the order the day shows them, with what they measure. */
export const METRICS = [
  { key: 'mood', label: 'Mood', color: '#e0707f' },
  { key: 'energy', label: 'Energy', color: '#ddb554' },
  { key: 'focus', label: 'Focus', color: '#8b6fe0' },
  { key: 'soc', label: 'Social', color: '#52bfc4' },
] as const;
export type MetricKey = (typeof METRICS)[number]['key'];

/** A habit's colour, by its place in the list. */
export const habitColor = (index: number) => PALETTE[index % PALETTE.length] ?? '#8fbcaa';
