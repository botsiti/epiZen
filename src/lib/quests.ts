import { SPHERES } from './categories';
import { addDays, formatDate } from './dates';
import { lineEnding } from './text';

// Quests, as the vault's Obsidian RPG scripts keep them (Templates/Scripts/rpg-shared.js):
//
//   - [ ] #quest/monthly - 13 kefir videos public [xp::1000] [spheres::Career/Work, Personal Growth:30] [tier::epic] [target::13] [current::2]
//       - 03.10.2026 :: First video up.
//       - 03.10.2026 :: +77 XP
//
// Weekly quests live in weekly notes, monthly quests in monthly notes, and mythic quests
// (`#quest/custom`) in Calendar/Custom Quests.md.

export type Scope = 'weekly' | 'monthly' | 'custom';
export type Tier = 'common' | 'rare' | 'epic' | 'legendary';

export const TIERS: Record<Tier, { glyph: string; color: string; xp: number; penalty: number }> = {
  legendary: { glyph: '✦', color: 'oklch(0.835 0.110 85)', xp: 2000, penalty: 2 },
  epic: { glyph: '◆', color: 'oklch(0.725 0.130 302)', xp: 1000, penalty: 1.5 },
  rare: { glyph: '◈', color: 'oklch(0.720 0.115 248)', xp: 500, penalty: 1 },
  common: { glyph: '▢', color: 'oklch(0.680 0.011 260)', xp: 150, penalty: 0.5 },
};
export const MYTHIC = { label: 'Mythic', glyph: '✧', color: 'oklch(0.800 0.135 35)' };

/** A life sphere's colour, from the one list the homepage and categories use. */
export const sphereColor = (name: string): string => SPHERES.find((sphere) => sphere.name === name)?.color ?? 'oklch(0.720 0.115 248)';

export interface LogEntry {
  line: number;
  date: string;
  text: string;
  /** A `+N XP` stamp rather than a chapter. */
  xp?: number;
}

export interface Quest {
  path: string;
  /** Zero-based line of the quest in its note, and the line as it reads, to find it again. */
  line: number;
  raw: string;
  scope: Scope;
  checked: boolean;
  /** Ticked, or a counter at its target. */
  done: boolean;
  title: string;
  xp: number;
  tier: Tier;
  spheres: { name: string; weight: number }[];
  start?: string;
  deadline?: string;
  doneOn?: string;
  target?: number;
  current?: number;
  desc?: string;
  image?: string;
  log: LogEntry[];
}

const QUEST = /^(\s*)[-*+]\s+\[([ xX])\]\s+.*#quest\/(weekly|monthly|custom)\b/;
const FIELD = /\[([\w-]+)::([^\]]*)\]/g;
const LOG = /^\s+[-*+]\s+(\d{2}\.\d{2}\.\d{4})\s*::\s*(.*)$/;
const STAMP = /^([+-]\d+)\s*XP$/i;

/** 299 and under common, then rare, epic and legendary at 300, 700 and 1500, as the scripts infer it. */
export const tierOf = (xp: number): Tier => (xp >= 1500 ? 'legendary' : xp >= 700 ? 'epic' : xp >= 300 ? 'rare' : 'common');

function fields(line: string) {
  const found: Record<string, string> = {};
  for (const match of line.matchAll(FIELD)) found[(match[1] ?? '').toLowerCase()] = (match[2] ?? '').trim();
  return found;
}

/** A quest's title: the line without its box, tags, fields and comments. */
const titleOf = (line: string) =>
  line
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(FIELD, '')
    .replace(/#[\w/-]+/g, '')
    .replace(/^\s*[-—–]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

const isoDate = (value?: string) => {
  if (!value) return undefined;
  const dmy = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
};

/** Every quest line in a note, with its fields and the log indented under it. */
export function parseQuests(path: string, text: string): Quest[] {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  const quests: Quest[] = [];
  lines.forEach((raw, line) => {
    const match = QUEST.exec(raw);
    if (!match) return;
    const depth = (match[1] ?? '').length;
    const f = fields(raw);
    const xp = Number(f.xp) || 0;
    const tier = (['common', 'rare', 'epic', 'legendary'] as const).find((t) => t === f.tier?.toLowerCase()) ?? (match[3] === 'custom' ? 'epic' : tierOf(xp));
    const spheres = (f.spheres ?? f.sphere ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part, i) => {
        const [name = '', weight] = part.split(':').map((s) => s.trim());
        return { name, weight: weight ? Number(weight) || 0 : i === 0 ? 100 : 30 };
      });
    const log: LogEntry[] = [];
    for (let i = line + 1; i < lines.length; i += 1) {
      const child = lines[i] ?? '';
      if (!child.trim()) continue;
      if ((/^\s*/.exec(child)?.[0].length ?? 0) <= depth) break;
      const entry = LOG.exec(child);
      if (!entry) continue;
      const stamp = STAMP.exec((entry[2] ?? '').trim());
      log.push({ line: i, date: entry[1] ?? '', text: (entry[2] ?? '').trim(), xp: stamp ? Number(stamp[1]) : undefined });
    }
    const target = f.target ? Number(f.target) || undefined : undefined;
    const current = f.current !== undefined ? Number(f.current) || 0 : undefined;
    const checked = match[2] !== ' ';
    quests.push({
      path,
      line,
      raw,
      scope: match[3] as Scope,
      checked,
      done: checked || (target !== undefined && (current ?? 0) >= target),
      title: titleOf(raw),
      xp,
      tier,
      spheres,
      start: isoDate(f.start),
      deadline: isoDate(f.deadline),
      doneOn: isoDate(f.done),
      target,
      current,
      desc: f.desc || undefined,
      image: f.image?.replace(/^\[\[|\]\]$/g, '') || undefined,
      log,
    });
  });
  return quests;
}

/** How far along a quest is, 0 to 1: a counter's share, else done or not. */
export const progress = (quest: Quest) =>
  quest.target ? Math.min(1, Math.max(0, (quest.current ?? 0) / quest.target)) : quest.done ? 1 : 0;

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** ×1.25 when done a week or more before an explicit deadline, ×0.7 when done after it, else ×1. */
export function deadlineMultiplier(quest: Quest): number {
  if (!quest.deadline || !quest.done || !quest.doneOn) return 1;
  const early = days(quest.doneOn, quest.deadline);
  return early >= 7 ? 1.25 : early < 0 ? 0.7 : 1;
}

/** XP earned so far: each sphere's weighted share, curved so the last steps of a counter pay most. */
export function earned(quest: Quest): number {
  const share = Math.pow(progress(quest), 2.5);
  const spheres = quest.spheres.length ? quest.spheres : [{ name: '', weight: 100 }];
  return Math.round(spheres.reduce((sum, sphere) => sum + Math.round((quest.xp * sphere.weight) / 100 * share), 0) * deadlineMultiplier(quest));
}

/** The day a quest is due: its own deadline, or the end of its week or month. */
export function dueDate(quest: Quest, period?: { from: Date; to: Date }): string | undefined {
  if (quest.deadline) return quest.deadline;
  return period ? formatDate(addDays(period.to, -1), 'YYYY-MM-DD') : undefined;
}

/** The XP an open quest has lost: half past its own deadline, a quarter past its week, 15% past its month, times its tier's weight. */
export function penalty(quest: Quest, today: string, period?: { from: Date; to: Date }): number {
  if (quest.done) return 0;
  const rate = quest.deadline
    ? quest.deadline < today
      ? 0.5
      : 0
    : period && formatDate(addDays(period.to, -1), 'YYYY-MM-DD') < today
      ? quest.scope === 'weekly'
        ? 0.25
        : 0.15
      : 0;
  return Math.round(quest.xp * rate * TIERS[quest.tier].penalty);
}

/** Whether a mythic quest runs on any day of the range: from its start to its deadline, either side open. */
export function activeIn(quest: Quest, from: string, to: string): boolean {
  return (!quest.start || quest.start <= to) && (!quest.deadline || quest.deadline >= from);
}

/** A quest with the week or month it belongs to (none for a mythic quest). */
export interface QuestEntry {
  quest: Quest;
  period?: { from: Date; to: Date };
}

/** The quests that run in a range of days, `to` excluded: the weeks and months it overlaps, and mythic quests active in it. */
export function questsIn(entries: QuestEntry[], from: Date, to: Date): QuestEntry[] {
  const first = formatDate(from, 'YYYY-MM-DD');
  const last = formatDate(addDays(to, -1), 'YYYY-MM-DD');
  return entries.filter(({ quest, period }) => (period ? period.from < to && period.to > from : activeIn(quest, first, last)));
}

/** What every quest has earned for each life sphere, by the sphere's weight. */
export function questSphereXp(entries: QuestEntry[]): Map<string, number> {
  const xp = new Map<string, number>();
  for (const { quest } of entries) {
    const share = Math.pow(progress(quest), 2.5) * deadlineMultiplier(quest);
    for (const sphere of quest.spheres) xp.set(sphere.name, (xp.get(sphere.name) ?? 0) + Math.round(((quest.xp * sphere.weight) / 100) * share));
  }
  return xp;
}

/** The XP quests add to a life: what they earned, less what open quests lost past their time. */
export const questXp = (entries: QuestEntry[], today: string) =>
  entries.reduce((sum, { quest, period }) => sum + earned(quest) - penalty(quest, today, period), 0);

/** `Career/Work` → `career-work`, the art file's name. */
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[\s/]+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

/** The vault paths to try for a quest's art, in order. */
export function artPaths(quest: Quest): string[] {
  const own = quest.image ? [quest.image] : [];
  if (quest.scope === 'custom') return [...own, 'Templates/quest-art/_custom epic.png', 'Templates/quest-art/_custom epic.svg'];
  const sphere = quest.spheres[0]?.name;
  if (!sphere) return own;
  return [...own, ...['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].map((ext) => `Templates/quest-art/_${slug(sphere)}.${ext}`)];
}

// Writes. Each finds the quest by its line and refuses when the line no longer reads as it did.

function open(text: string, quest: Quest) {
  const eol = lineEnding(text);
  if (!eol) throw new Error("This note mixes line endings, so Epizen won't change it.");
  const lines = text.split(eol);
  if (lines[quest.line] !== quest.raw) throw new Error('That quest has changed in its note.');
  return { eol, lines };
}

function setField(line: string, key: string, value: string | undefined): string {
  const pattern = new RegExp(`\\s*\\[${key}::[^\\]]*\\]`);
  if (value === undefined) return line.replace(pattern, '');
  if (pattern.test(line)) return line.replace(new RegExp(`\\[${key}::[^\\]]*\\]`), `[${key}::${value}]`);
  const comment = /\s*<!--[\s\S]*?-->\s*$/.exec(line);
  return comment ? `${line.slice(0, comment.index)} [${key}::${value}]${comment[0]}` : `${line.replace(/\s+$/, '')} [${key}::${value}]`;
}

/**
 * Adds `delta` XP to today's `+N XP` stamp under the quest (as the scripts do), keeping the day's
 * net between 0 and the quest's XP. A net of 0 takes the stamp out.
 */
function stamp(lines: string[], quest: Quest, delta: number, today: Date) {
  if (!delta) return;
  const date = formatDate(today, 'DD.MM.YYYY');
  const indent = `${/^\s*/.exec(quest.raw)?.[0] ?? ''}    `;
  const existing = quest.log.find((entry) => entry.date === date && entry.xp !== undefined);
  const net = Math.max(0, Math.min(quest.xp || Number.MAX_SAFE_INTEGER, (existing?.xp ?? 0) + delta));
  const line = `${indent}- ${date} :: +${net} XP`;
  if (existing) {
    if (net) lines[existing.line] = line;
    else lines.splice(existing.line, 1);
  } else if (net) {
    // After the quest's last log line, or right under the quest.
    const last = quest.log.at(-1)?.line ?? quest.line;
    lines.splice(last + 1, 0, line);
  }
}

/** Ticks or unticks a quest: its box, its `[done::]` date, a counter's `current`, and today's XP stamp. */
export function toggleQuest(text: string, quest: Quest, today: Date): string {
  const { eol, lines } = open(text, quest);
  const done = !quest.done;
  let line = quest.raw.replace(/\[[ xX]\]/, done ? '[x]' : '[ ]');
  line = setField(line, 'done', done ? (quest.doneOn ?? formatDate(today, 'YYYY-MM-DD')) : undefined);
  let delta = done ? quest.xp : -quest.xp;
  if (quest.target) {
    const now = done ? quest.target : 0;
    delta = Math.round(((now - Math.min(quest.current ?? 0, quest.target)) * quest.xp) / quest.target);
    line = setField(line, 'current', String(now));
  }
  lines[quest.line] = line;
  stamp(lines, quest, delta, today);
  return lines.join(eol);
}

/** Sets a counter quest's progress, clamped to its target; reaching the target ticks it, falling below unticks it. */
export function setQuestProgress(text: string, quest: Quest, value: number, today: Date): string {
  if (!quest.target) throw new Error('That quest has no counter.');
  const { eol, lines } = open(text, quest);
  const now = Math.max(0, Math.min(quest.target, Math.round(value)));
  const before = Math.min(quest.current ?? 0, quest.target);
  let line = setField(quest.raw, 'current', String(now));
  const done = now >= quest.target;
  line = line.replace(/\[[ xX]\]/, done ? '[x]' : '[ ]');
  line = setField(line, 'done', done ? (quest.doneOn ?? formatDate(today, 'YYYY-MM-DD')) : undefined);
  lines[quest.line] = line;
  stamp(lines, quest, Math.round(((now - before) * quest.xp) / quest.target), today);
  return lines.join(eol);
}
