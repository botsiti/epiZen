import { forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import { describe, expect, it } from 'vitest';
import { buildGraph, findNode, graphKey, localGraph, nodeAt, type GraphLink, type GraphNode } from './graph';

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

describe('localGraph', () => {
  const DAY = 'Calendar/2026/days 2026/10.08.2026.md';
  const MONTH = 'Calendar/2026/months 2026/08.26 RPG.md';
  const ALBUM = 'Rating/music/Glasshouse Weather.md';
  const HOME = '00. Home 2026.md';
  const WEEK = 'Calendar/2026/weeks/2026-W33 - 10.08.26.md';
  const graph = buildGraph(
    [DAY, MONTH, ALBUM, HOME, WEEK],
    new Map([
      [DAY, [ALBUM, WEEK]],
      [MONTH, [ALBUM, DAY]],
      [HOME, [MONTH]],
    ]),
  );

  it('has the note, its neighbours and the links among them', () => {
    const local = localGraph(graph, ALBUM);
    expect(local.nodes.map((node) => node.title).sort()).toEqual(['08.26 RPG', '10.08.2026', 'Glasshouse Weather']);
    // Album to day, album to month, and day to month between the neighbours.
    expect(local.links).toHaveLength(3);
    expect([...(local.neighbours.get(DAY) ?? [])].sort()).toEqual([MONTH, ALBUM].sort());
  });

  it('reaches further with a greater depth', () => {
    expect(localGraph(graph, ALBUM, 2).nodes.map((node) => node.title).sort()).toEqual(['00. Home 2026', '08.26 RPG', '10.08.2026', '2026-W33 - 10.08.26', 'Glasshouse Weather']);
  });

  it('keeps the whole graph’s colours and sizes on nodes of its own', () => {
    const local = localGraph(graph, ALBUM);
    for (const node of local.nodes) {
      const whole = graph.nodes.find((n) => n.id === node.id);
      expect(node).not.toBe(whole);
      expect([node.group, node.radius]).toEqual([whole?.group, whole?.radius]);
    }
    expect(local.groups).toBe(graph.groups);
  });

  it('is empty for a note that isn’t in the graph, and alone for one without links', () => {
    expect(localGraph(graph, 'Gone.md').nodes).toEqual([]);
    const alone = buildGraph([HOME], new Map());
    expect(localGraph(alone, HOME).nodes.map((node) => node.title)).toEqual(['00. Home 2026']);
  });

  it('keys a graph by its notes and links, so the same one isn’t laid out again', () => {
    expect(graphKey(localGraph(graph, ALBUM))).toBe(graphKey(localGraph(buildGraph([DAY, MONTH, ALBUM, HOME, WEEK], new Map([[DAY, [ALBUM, WEEK]], [MONTH, [ALBUM, DAY]], [HOME, [MONTH]]])), ALBUM)));
    expect(graphKey(localGraph(graph, ALBUM))).not.toBe(graphKey(localGraph(graph, DAY)));
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
    // Six batches of 20 steps, and the fastest counts: the layout's own cost, not the other test
    // files and CI jobs the machine runs beside it, which only ever add time to a batch.
    const batches = Array.from({ length: 6 }, () => {
      const started = performance.now();
      simulation.tick(20);
      return (performance.now() - started) / 20;
    });
    const perTick = Math.min(...batches);
    expect(graph.links.length).toBeGreaterThan(4000);
    // A 60 fps frame is 16.7 ms; a layout step must fit in one, even on a slow CI machine.
    // (The e2e check measures real frames per second on a 2,000-note vault.)
    expect(perTick).toBeLessThan(16);
  });
});
