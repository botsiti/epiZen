/**
 * Saves that must finish before the app closes. Each open editor registers a flush, and a save
 * an editor started as it closed is tracked until it lands. Each resolves to its note's path if
 * the note couldn't be saved.
 */
const flushes = new Set<() => Promise<string | undefined>>();
const inflight = new Set<Promise<string | undefined>>();

/** Registers a flush; returns a function that removes it. */
export function flushBeforeClose(flush: () => Promise<string | undefined>): () => void {
  flushes.add(flush);
  return () => flushes.delete(flush);
}

/** Keeps a save that is already under way in what `flushAll` waits for, until it lands. */
export function trackSave(save: Promise<string | undefined>): Promise<string | undefined> {
  inflight.add(save);
  void save.finally(() => inflight.delete(save));
  return save;
}

/** Runs every registered save and waits for those under way. Resolves to the notes that couldn't be saved, sorted. */
export async function flushAll(): Promise<string[]> {
  const results = await Promise.all([...[...flushes].map((flush) => flush()), ...inflight]);
  return [...new Set(results.filter((path): path is string => path !== undefined))].sort();
}

/**
 * Resolves once every save under way has landed, failed or not. A note that opens again (in
 * another tab, or back in its own) reads after its editor's last save, never the text before it.
 */
export async function whenSaved(): Promise<void> {
  await Promise.allSettled([...inflight]);
}
