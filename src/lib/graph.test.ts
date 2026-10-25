import { forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import { describe, expect, it } from 'vitest';
import { buildGraph, findNode, nodeAt, type GraphLink, type GraphNode } from './graph';

describe('buildGraph', () => {
  const graph = buildGraph(
    ['Calendar/2026/days 2026/10.08.2026.md', 'Calendar/2026/months 2026/08.26 RPG.md', 'Rating/music/Glasshouse Weather.md', '00. Home 2026.md'],
    new Map([
      ['Calendar/2026/days 2026/10.08.2026.md', ['Rating/music/Glasshouse Weather.md']],
      ['Rating/music/Glasshouse Weather.md', ['Calendar/2026/days 2026/10.08.2026.md']],
      ['Calendar/2026/months 2026/08.26 RPG.md', ['Rating/music/Glasshouse Weather.md', 'Missing.md']],
    ]),
  );

  it('has every note, and one link per linked pair', () => {
    expect(graph.nodes.map((node) => node.title)).toEqual(['10.08.2026', '08.26 RPG', 'Glasshouse Weather', '00. Home 2026']);
    expect(graph.links).toHaveLength(2);
    expect([...(graph.neighbours.get('Rating/music/Glasshouse Weather.md') ?? [])].sort()).toEqual([
      'Calendar/2026/days 2026/10.08.2026.md',
      'Calendar/2026/months 2026/08.26 RPG.md',
    ]);
  });

  it('groups notes by top-level folder, the biggest first', () => {
    expect(graph.groups).toEqual([
      { name: 'Calendar', count: 2 },
      { name: '', count: 1 },
      { name: 'Rating', count: 1 },
    ]);
    expect(graph.nodes.map((node) => node.group)).toEqual([0, 0, 2, 1]);
  });

  it('finds a note under the pointer and by name', () => {
    const [a, b] = graph.nodes;
    Object.assign(a ?? {}, { x: 0, y: 0 });
    Object.assign(b ?? {}, { x: 40, y: 0 });
    expect(nodeAt(graph.nodes.slice(0, 2), 2, 1, 4)?.title).toBe('10.08.2026');
    expect(nodeAt(graph.nodes.slice(0, 2), 20, 20, 4)).toBeUndefined();
    expect(findNode(graph.nodes, 'glass')?.title).toBe('Glasshouse Weather');
    expect(findNode(graph.nodes, 'RPG')?.title).toBe('08.26 RPG');
  });
});

describe('the graph with 2,000 notes', () => {
  it('lays out in well under a frame per step', () => {
    // A vault shaped like a real one: daily notes linking weeks, months and media, plus loose notes.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const paths = Array.from({ length: 2000 }, (_, i) => `Folder ${i % 12}/Note ${i}.md`);
    const outgoing = new Map(paths.map((path) => [path, Array.from({ length: 1 + Math.floor(rand() * 4) }, () => paths[Math.floor(rand() * paths.length)] ?? path)]));
    const graph = buildGraph(paths, outgoing);
    const simulation = forceSimulation(graph.nodes)
      .force('link', forceLink<GraphNode, GraphLink>(graph.links).id((node) => node.id).distance(36).strength(0.25))
      .force('charge', forceManyBody<GraphNode>().strength(-55).distanceMax(420).theta(0.9))
      .force('x', forceX<GraphNode>(0).strength(0.05))
      .force('y', forceY<GraphNode>(0).strength(0.05))
      .stop();
    const started = performance.now();
    simulation.tick(120);
    const perTick = (performance.now() - started) / 120;
    expect(graph.links.length).toBeGreaterThan(4000);
    // A 60 fps frame is 16.7 ms; the layout step must leave most of it for drawing.
    expect(perTick).toBeLessThan(8);
  });
});
