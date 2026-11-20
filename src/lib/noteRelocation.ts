import type { Settings } from './api';
import { formatDate } from './dates';
import { periodOf, type PeriodicRecognition, type PeriodicSettings } from './periodic';
import { focusIdOf } from './timeblocks';

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function relocatedNoteSettings(settings: Settings, root: string, from: string, to: string, text: string, periodic: PeriodicSettings, recognition: PeriodicRecognition): Settings | undefined {
  const vaults = record(settings.vaults);
  const vault = record(vaults[root]);
  const dates = { ...recognition.dates };
  const preferred = Object.fromEntries(Object.entries(recognition.preferred).map(([key, path]) => [key, path === from ? to : path]));
  const found = periodOf(from, periodic, text, recognition);
  const newPeriod = periodOf(to, periodic, text, recognition);
  const explicit = Object.hasOwn(dates, from);
  const keepDate = found && (found.period !== newPeriod?.period || +found.date !== +newPeriod.date) ? found : undefined;
  if (explicit) {
    dates[to] = dates[from]!;
    delete dates[from];
  } else if (keepDate) {
    dates[to] = { period: keepDate.period, date: formatDate(keepDate.date, 'YYYY-MM-DD') };
  }
  const aliases = { ...record(vault.movedTaskPaths) };
  let taskPathsChanged = false;
  for (const key of Object.keys(aliases)) {
    if (aliases[key] === from) { aliases[key] = to; taskPathsChanged = true; }
  }
  for (const line of text.split(/\r?\n/)) {
    const id = focusIdOf(line);
    if (id) { aliases[taskPathKey(from, id)] = to; taskPathsChanged = true; }
  }
  if (!explicit && !keepDate && !taskPathsChanged && !Object.values(recognition.preferred).includes(from)) return undefined;
  const legacy = !Object.keys(vault).length && settings.legacyPeriodicVault === root && settings.periodic;
  return { vaults: { ...vaults, [root]: {
    ...vault, ...(legacy ? { complete: true, periodic } : {}), recognition: { ...recognition, dates, preferred },
    ...(taskPathsChanged ? { movedTaskPaths: aliases } : {}),
  } } };
}

const taskPathKey = (path: string, focusId: string) => JSON.stringify([path, focusId]);

export function taskPathResolver(settings: Settings, root: string): (path: string, focusId: string) => string {
  const aliases = record(record(record(settings.vaults)[root]).movedTaskPaths);
  return (path, id) => {
    const target = aliases[taskPathKey(path, id)];
    return typeof target === 'string' ? target : path;
  };
}
