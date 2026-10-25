import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import { noteTitle } from './links';

export interface GraphNode extends SimulationNodeDatum {
  /** The note's path. */
  id: string;
  title: string;
  /** Index into `Graph.groups`: the note's top-level folder. */
  group: number;
  /** Links to and from the note. */
  degree: number;
  radius: number;
}

export type GraphLink = SimulationLinkDatum<GraphNode> & { source: string | GraphNode; target: string | GraphNode };

export interface Graph {
  nodes: GraphNode[];
  links: GraphLink[];
  /** Top-level folders, the biggest first; each gets a colour, and the ones past the palette share the last. */
  groups: { name: string; count: number }[];
  /** Each note's linked notes, both ways. */
  neighbours: Map<string, Set<string>>;
}

/** The graph's folder colours, `--graph-1` to `--graph-8` in styles.css. */
export const PALETTE_SIZE = 8;

const folderOf = (path: string) => (path.includes('/') ? path.slice(0, path.indexOf('/')) : '');

/** Every note, and one link for each pair of notes that link to each other in either direction. */
export function buildGraph(paths: string[], outgoing: ReadonlyMap<string, string[]>): Graph {
  const known = new Set(paths);
  const neighbours = new Map<string, Set<string>>(paths.map((path) => [path, new Set()]));
  const links: GraphLink[] = [];
  for (const [from, targets] of outgoing) {
    for (const to of targets) {
      if (!known.has(from) || !known.has(to) || from === to || neighbours.get(from)?.has(to)) continue;
      neighbours.get(from)?.add(to);
      neighbours.get(to)?.add(from);
      links.push({ source: from, target: to });
    }
  }
  const sizes = new Map<string, number>();
  for (const path of paths) sizes.set(folderOf(path), (sizes.get(folderOf(path)) ?? 0) + 1);
  const groups = [...sizes].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const groupOf = new Map(groups.map((group, i) => [group.name, i]));
  const nodes = paths.map((path) => {
    const degree = neighbours.get(path)?.size ?? 0;
    return { id: path, title: noteTitle(path), group: groupOf.get(folderOf(path)) ?? 0, degree, radius: Math.min(3 + Math.sqrt(degree) * 1.6, 14) };
  });
  return { nodes, links, groups, neighbours };
}

/** The note drawn under a point in graph space, if any; `slack` widens small targets. */
export function nodeAt(nodes: GraphNode[], x: number, y: number, slack: number): GraphNode | undefined {
  let best: GraphNode | undefined;
  let bestDistance = Infinity;
  for (const node of nodes) {
    const distance = Math.hypot((node.x ?? 0) - x, (node.y ?? 0) - y);
    if (distance <= node.radius + slack && distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}

/** The note a search means: a title that starts with it, else one that contains it, the best linked first. */
export function findNode(nodes: GraphNode[], query: string): GraphNode | undefined {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return undefined;
  const byDegree = (a: GraphNode, b: GraphNode) => b.degree - a.degree;
  const starts = nodes.filter((node) => node.title.toLowerCase().startsWith(wanted)).sort(byDegree);
  return starts[0] ?? nodes.filter((node) => node.title.toLowerCase().includes(wanted)).sort(byDegree)[0];
}
