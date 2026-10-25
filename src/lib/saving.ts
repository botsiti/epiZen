/**
 * Saves that must finish before the app closes. Each open editor registers its own, which
 * resolves to its note's path if the note couldn't be saved.
 */
const flushes = new Set<() => Promise<string | undefined>>();

/** Registers a flush; returns a function that removes it. */
export function flushBeforeClose(flush: () => Promise<string | undefined>): () => void {
  flushes.add(flush);
  return () => flushes.delete(flush);
}

/** Runs every registered save. Resolves to the notes that couldn't be saved, sorted; empty when all were. */
export async function flushAll(): Promise<string[]> {
  const results = await Promise.all([...flushes].map((flush) => flush()));
  return results.filter((path): path is string => path !== undefined).sort();
}
