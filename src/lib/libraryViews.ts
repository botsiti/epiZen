import type { MediaEntry, SortOrder } from './library';

export type SortDirection = 'asc' | 'desc';
export interface LibrarySort { field: SortOrder; direction: SortDirection }
export const sortDirection = (field: SortOrder): SortDirection => field === 'title' || field === 'maker' ? 'asc' : 'desc';
export const LIST_PAGE_SIZE = 10;

/** Years listened, watched or finished, independent of a work's release year. */
export function libraryYears(entries: MediaEntry[]): string[] {
  return [...new Set(entries.flatMap((entry) => entry.date ? [entry.date.slice(0, 4)] : []))].sort().reverse();
}

export function filterLibrary(entries: MediaEntry[], years: readonly string[] = [], minimumRating?: number): MediaEntry[] {
  return entries.filter((entry) => (!years.length || years.includes(entry.date?.slice(0, 4) ?? '')) && (minimumRating === undefined || (entry.rating !== undefined && entry.rating >= minimumRating)));
}

/** Ordered sort rules, with missing values always last and stable title/path tie breakers. */
export function sortLibrary(entries: MediaEntry[], rules: readonly LibrarySort[]): MediaEntry[] {
  const value = (entry: MediaEntry, field: SortOrder): string | number | undefined => field === 'recent' ? entry.date : field === 'year' ? (entry.year ? Number(entry.year) : undefined) : entry[field];
  const compare = (a: string | number, b: string | number) => typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
  return entries.toSorted((a, b) => {
    for (const rule of rules) {
      const av = value(a, rule.field), bv = value(b, rule.field);
      const absent = (v: typeof av) => v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v));
      if (absent(av) !== absent(bv)) return absent(av) ? 1 : -1;
      if (absent(av) || absent(bv)) continue;
      const order = compare(av!, bv!) * (rule.direction === 'asc' ? 1 : -1);
      if (order) return order;
    }
    return compare(a.title, b.title) || a.path.localeCompare(b.path);
  });
}
