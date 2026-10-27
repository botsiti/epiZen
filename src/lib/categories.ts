/** The life spheres a task's XP goes to, in the order the homepage lists them, in the Obsidian homepage's colours. */
export const SPHERES = [
  { name: 'Career/Work', color: 'oklch(0.7050 0.1350 22)' },
  { name: 'Health/Fitness', color: 'oklch(0.7600 0.1100 158)' },
  { name: 'Personal Growth', color: 'oklch(0.7200 0.1150 248)' },
  { name: 'Finance', color: 'oklch(0.8250 0.1050 92)' },
  { name: 'Spiritual', color: 'oklch(0.7250 0.1300 302)' },
  { name: 'Love/Relationship', color: 'oklch(0.7400 0.1050 350)' },
  { name: 'Fun/Recreation', color: 'oklch(0.7800 0.1000 65)' },
  { name: 'Social', color: 'oklch(0.7400 0.0900 205)' },
] as const;
export type Sphere = (typeof SPHERES)[number]['name'];

/** How a `#daily/<category>` task's minutes count: toward productive time or recovery, and at what XP rate. */
export interface Category {
  name: string;
  color: string;
  kind: 'main' | 'recovery';
  /** XP per logged minute. */
  multiplier: number;
  /** Which life spheres the task's XP goes to, in percent of it; they add up to 100. */
  spheres: Partial<Record<Sphere, number>>;
}

// The categories the vault's Obsidian dashboards know (Templates/Scripts/rpg-day.js), in their jewel colours.
const KNOWN: Record<string, Omit<Category, 'name'>> = {
  business: { color: '#e06681', kind: 'main', multiplier: 1, spheres: { 'Career/Work': 50, Finance: 50 } },
  kaizen: { color: '#e06681', kind: 'main', multiplier: 1, spheres: { 'Personal Growth': 100 } },
  code: { color: '#6fa5e6', kind: 'main', multiplier: 1, spheres: { 'Career/Work': 100 } },
  // Not one of the Obsidian scripts' own: teal, so it reads apart from code's blue in the same chart.
  study: { color: '#52bfc4', kind: 'main', multiplier: 1, spheres: { 'Personal Growth': 100 } },
  biology: { color: '#6fa5e6', kind: 'main', multiplier: 1, spheres: { 'Personal Growth': 100 } },
  math: { color: '#6fa5e6', kind: 'main', multiplier: 1, spheres: { 'Personal Growth': 100 } },
  sport: { color: '#63bd92', kind: 'main', multiplier: 1, spheres: { 'Health/Fitness': 100 } },
  meditation: { color: '#63bd92', kind: 'main', multiplier: 5, spheres: { Spiritual: 100 } },
  travel: { color: '#63bd92', kind: 'recovery', multiplier: 1, spheres: { 'Fun/Recreation': 100 } },
  leisure: { color: '#b48ede', kind: 'recovery', multiplier: 0.5, spheres: { 'Fun/Recreation': 50, Social: 50 } },
  english: { color: '#9b82e8', kind: 'main', multiplier: 1, spheres: { 'Personal Growth': 100 } },
  book: { color: '#dfa163', kind: 'main', multiplier: 0.5, spheres: { 'Personal Growth': 100 } },
  dog: { color: '#e8734f', kind: 'main', multiplier: 1, spheres: { 'Love/Relationship': 60, 'Personal Growth': 40 } },
  cinema: { color: '#dcbc72', kind: 'recovery', multiplier: 0.5, spheres: { 'Fun/Recreation': 100 } },
};

// Any other category takes one of these, the same one every time.
const PALETTE = ['#6fa5e6', '#63bd92', '#e06681', '#b48ede', '#dcbc72', '#dfa163', '#52bfc4', '#dd8fc0'];

export function category(name: string): Category {
  const known = KNOWN[name.toLowerCase()];
  if (known) return { name, ...known };
  let hash = 0;
  for (const char of name.toLowerCase()) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  // A category the vault's scripts don't know counts toward growing, as theirs does.
  return { name, color: PALETTE[hash % PALETTE.length] ?? '#8fbcaa', kind: 'main', multiplier: 1, spheres: { 'Personal Growth': 100 } };
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
