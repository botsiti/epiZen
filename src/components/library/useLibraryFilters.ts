import { useCallback, useEffect, useRef, useState } from 'react';
import { readFilters, type LibraryFilters } from '../../lib/library';
import { flushBeforeClose } from '../../lib/saving';

/** One owner for filter choices and their serialized, explicitly retryable settings writes. */
export function useLibraryFilters(initial: unknown, ready: boolean, existingVault: boolean, persist: (filters: LibraryFilters) => Promise<void>) {
  const [filters, setFilters] = useState<LibraryFilters>({ period: 'all' });
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string>();
  const failure = useRef(false), generation = useRef(0), queue = useRef(Promise.resolve());
  if (ready && !initialized) {
    setInitialized(true);
    // Existing vaults keep the previous all-time view; new vaults start with This year.
    setFilters(readFilters(initial ?? (existingVault ? { period: 'all' } : undefined)));
  }
  const change = useCallback((next: LibraryFilters) => {
    const operation = ++generation.current;
    setFilters(next); setError(undefined); failure.current = false;
    queue.current = queue.current.then(() => persist(next)).then(() => {
      if (generation.current === operation) { failure.current = false; setError(undefined); }
    }, (reason: unknown) => {
      if (generation.current === operation) { failure.current = true; setError(reason instanceof Error ? reason.message : String(reason)); }
    });
  }, [persist]);
  useEffect(() => flushBeforeClose(async () => { await queue.current; return failure.current ? 'Library filters' : undefined; }), []);
  return { filters, error, change, retry: () => change(filters) };
}
