/** Saves that must finish before the app closes. Each open editor registers its own. */
const flushes = new Set<() => Promise<boolean>>();

/** Registers a flush; returns a function that removes it. */
export function flushBeforeClose(flush: () => Promise<boolean>): () => void {
  flushes.add(flush);
  return () => flushes.delete(flush);
}

/** Runs every registered save. True when each of them reached its note. */
export async function flushAll(): Promise<boolean> {
  const results = await Promise.all([...flushes].map((flush) => flush()));
  return results.every(Boolean);
}
