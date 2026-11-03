import type { VaultFile } from './api';
import { formatDate } from './dates';
import { DEFAULT_PERIODIC, periodOf, type PeriodicRecognition, type PeriodicSettings } from './periodic';

/** Preview existing notes only; applying the result stores date links, never edits Markdown. */
export function discoverDailyNotes(files: VaultFile[], texts: ReadonlyMap<string, string>, folder: string, periodic: PeriodicSettings, recognition: PeriodicRecognition) {
  const search: PeriodicSettings = { ...DEFAULT_PERIODIC, day: { ...periodic.day, folder, history: [] } };
  return files.flatMap((file) => {
    if (file.kind !== 'note' || (folder && !file.path.startsWith(`${folder}/`))) return [];
    const found = periodOf(file.path, search, texts.get(file.path), recognition);
    return found?.period === 'day' ? [{ path: file.path, date: formatDate(found.date, 'YYYY-MM-DD') }] : [];
  }).sort((a, b) => b.date.localeCompare(a.date) || a.path.localeCompare(b.path));
}
