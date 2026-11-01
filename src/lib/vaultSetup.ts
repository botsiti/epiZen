import type { NoteText, Settings } from './api';
import { PERIODS, builtInPeriodicText, periodicPath, periodicSettings, recognitionSettings, type PeriodicRecognition, type PeriodicSettings } from './periodic';

const object = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};

export const STARTER_PERIODIC: PeriodicSettings = {
  day: { folder: 'Calendar', format: 'YYYY/[days]/YYYY-MM-DD', template: '' },
  week: { folder: 'Calendar', format: 'GGGG/[weeks]/GGGG-[W]WW', template: '' },
  month: { folder: 'Calendar', format: 'YYYY/[months]/YYYY-MM', template: '' },
};

export function vaultPreferences(settings: Settings, root: string) {
  const stored = object(object(settings.vaults)[root]);
  // Bind the former global setup to its first vault; never apply it to a second vault.
  const legacy = !Object.keys(stored).length && settings.periodic && settings.legacyPeriodicVault === root;
  return {
    complete: stored.complete === true || Boolean(legacy),
    periodic: periodicSettings(legacy ? settings : stored),
    recognition: recognitionSettings(stored.recognition ?? { dateOrder: legacy && /^M/.test(periodicSettings(settings).day.format) ? 'mdy' : 'dmy' }),
  };
}

export function vaultPreferencesPatch(settings: Settings, root: string, periodic: PeriodicSettings, recognition: PeriodicRecognition): Settings {
  return {
    ...(settings.periodic && !settings.legacyPeriodicVault ? { legacyPeriodicVault: root } : {}),
    vaults: { ...object(settings.vaults), [root]: { complete: true, periodic, recognition } },
  };
}

/** A small ordinary-Markdown starting vault. Future years are created lazily by periodicPath. */
export function starterNotes(date: Date): NoteText[] {
  const year = date.getFullYear();
  const notes = PERIODS.map((period) => ({ path: periodicPath(period, date, STARTER_PERIODIC), text: builtInPeriodicText(period, date) }));
  notes.push({ path: 'Welcome.md', text: `# Your second brain\n\nA quiet place for your days, ideas and the things you love.\n\n## Your calendar\n\n${notes.map((note) => `- [[${note.path.replace(/\.md$/, '')}]]`).join('\n')}\n\nOpen a date in the calendar to begin a day, week or month. New years get their own folders. Your notes are ordinary Markdown and can travel with you.\n\n## Your library\n\nKeep music, films, books, podcasts and videos in the Library. Covers live in an _attachments folder beside their notes.\n` });
  for (const [folder, title] of [['music', `Music ${year} MOC`], ['kino', `Kino ${year}`], ['books', 'Books'], ['podcasts', `Podcast ${year}`], ['youtube', `YouTube ${year}`]]) {
    notes.push({ path: `Rating/${folder}/00. ${title}.md`, text: `# ${title}\n\nAdd your favourites from Epizen’s Library.\n` });
  }
  return notes;
}

/** Preflight before any writes, then create-only. Safe to resume a partially completed setup. */
export async function createStarterVault(notes: NoteText[], existing: NoteText[], create: (path: string, text: string) => Promise<void>): Promise<void> {
  const planned = new Map(notes.map((note) => [note.path, note.text]));
  for (const note of existing) {
    if (planned.get(note.path) !== note.text) throw new Error('Choose an empty folder for a new vault, or connect this folder as an existing vault.');
  }
  const present = new Set(existing.map((note) => note.path));
  for (const note of notes) if (!present.has(note.path)) await create(note.path, note.text);
}
