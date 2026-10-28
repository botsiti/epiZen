import { useMemo, useState } from 'react';
import { graphKey, localGraph, type Graph } from '../../lib/graph';

/**
 * The local graph of the note in front, while the right sidebar shows it. The whole graph is built
 * again on every save; the local one stays the same object while its notes and links do, so the
 * panel isn't laid out again while the note is being typed in.
 */
export function useLocalGraph(graph: Graph, note: string | undefined, shown: boolean): Graph | undefined {
  const fresh = useMemo(() => {
    if (!shown || note === undefined) return undefined;
    const local = localGraph(graph, note);
    return { graph: local, key: graphKey(local) };
  }, [graph, note, shown]);
  const [kept, setKept] = useState(fresh);
  if (fresh?.key !== kept?.key) {
    setKept(fresh);
    return fresh?.graph;
  }
  return kept?.graph;
}
