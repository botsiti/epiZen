import { forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import { useEffect, useRef, useState } from 'react';
import { findNode, nodeAt, PALETTE_SIZE, type Graph, type GraphLink, type GraphNode } from '../lib/graph';
import { opensInNewTab } from '../lib/tabs';

interface Props {
  graph: Graph;
  /** A note was clicked; `newTab` for a ⌘-click or a middle click. */
  onOpen: (path: string, newTab: boolean) => void;
  /**
   * The local graph in the right sidebar: a note (`center`, lit) and its neighbours, in a panel,
   * without the legend, the search and the hint.
   */
  local?: { center: string };
}

/** Shared between the canvas loop and the React handlers, which shouldn't re-render per frame. */
interface View {
  /** Zoom and pan: a graph point (gx, gy) is drawn at (width / 2 + x + gx * k, height / 2 + y + gy * k). */
  k: number;
  x: number;
  y: number;
  /** Keeps the whole graph in view until the user zooms or drags. */
  fitting: boolean;
  hovered?: string;
  searched?: string;
  redraw: () => void;
}

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 8;

/**
 * Every note as a dot and every link as a line, laid out by d3-force and drawn on a canvas so
 * thousands of notes stay smooth. Dots take their top-level folder's colour; pointing at one
 * lights it and its neighbours up and dims the rest. Scroll zooms, dragging moves, a click opens.
 */
export function GraphView({ graph, onOpen, local }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ k: 1, x: 0, y: 0, fitting: true, redraw: () => undefined });
  const [settled, setSettled] = useState(false);
  const [focus, setFocus] = useState<string>();
  const [query, setQuery] = useState('');

  const own = local?.center;
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const v = view.current;
    // The local graph keeps its note lit, as a search does.
    if (own) v.searched = own;
    const css = getComputedStyle(canvas);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const colors = Array.from({ length: PALETTE_SIZE }, (_, i) => token(`--graph-${i + 1}`));
    const [text, faint, accent, font] = [token('--text'), token('--text-faint'), token('--accent'), token('--font-ui')];
    const { nodes, links, neighbours } = graph;
    // Many links read as a grey cloud; thin them out as they grow.
    const linkAlpha = Math.min(1, Math.sqrt(300 / Math.max(links.length, 1)));

    // A local graph has few notes and a small panel: they stand further apart, so their names can be read.
    const spread = own ? { distance: 72, charge: -240, pad: 90, zoom: 2.5 } : { distance: 36, charge: -55, pad: 160, zoom: 2 };
    const simulation = forceSimulation(nodes)
      .force('link', forceLink<GraphNode, GraphLink>(links).id((node) => node.id).distance(spread.distance).strength(0.25))
      .force('charge', forceManyBody<GraphNode>().strength(spread.charge).distanceMax(420).theta(0.9))
      .force('x', forceX<GraphNode>(0).strength(0.05))
      .force('y', forceY<GraphNode>(0).strength(0.05))
      .alphaDecay(0.028)
      .velocityDecay(0.35)
      .stop();

    let width = 0;
    let height = 0;
    let dpr = 1;
    let frame = 0;
    let running = true;

    const fit = () => {
      if (!nodes.length) return;
      let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const node of nodes) {
        minX = Math.min(minX, node.x ?? 0);
        maxX = Math.max(maxX, node.x ?? 0);
        minY = Math.min(minY, node.y ?? 0);
        maxY = Math.max(maxY, node.y ?? 0);
      }
      v.k = Math.min(Math.max(Math.min(width / (maxX - minX + spread.pad), height / (maxY - minY + spread.pad)), MIN_ZOOM), spread.zoom);
      v.x = -((minX + maxX) / 2) * v.k;
      v.y = -((minY + maxY) / 2) * v.k;
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * (width / 2 + v.x), dpr * (height / 2 + v.y));
      const center = v.hovered ?? v.searched;
      const lit = center ? neighbours.get(center) : undefined;
      const isLit = (id: string) => !lit || id === center || lit.has(id);
      const touches = (link: GraphLink) => (link.source as GraphNode).id === center || (link.target as GraphNode).id === center;

      // Links: one path for the quiet ones, one in accent for the pointed note's.
      ctx.lineWidth = 1 / v.k;
      ctx.strokeStyle = faint;
      ctx.globalAlpha = (lit ? 0.1 : 0.32) * linkAlpha;
      ctx.beginPath();
      for (const link of links) {
        if (lit && touches(link)) continue;
        const { x: x1 = 0, y: y1 = 0 } = link.source as GraphNode;
        const { x: x2 = 0, y: y2 = 0 } = link.target as GraphNode;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
      if (lit) {
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.4 / v.k;
        ctx.beginPath();
        for (const link of links) {
          if (!touches(link)) continue;
          ctx.moveTo((link.source as GraphNode).x ?? 0, (link.source as GraphNode).y ?? 0);
          ctx.lineTo((link.target as GraphNode).x ?? 0, (link.target as GraphNode).y ?? 0);
        }
        ctx.stroke();
      }

      // Dots: dimmed ones first, then the lit ones on top; one path per folder colour.
      for (const pass of lit ? [false, true] : [true]) {
        ctx.globalAlpha = pass ? 1 : 0.16;
        for (let color = 0; color < PALETTE_SIZE; color += 1) {
          ctx.fillStyle = colors[color] ?? faint;
          ctx.beginPath();
          for (const node of nodes) {
            if (Math.min(node.group, PALETTE_SIZE - 1) !== color || isLit(node.id) !== pass) continue;
            ctx.moveTo((node.x ?? 0) + node.radius, node.y ?? 0);
            ctx.arc(node.x ?? 0, node.y ?? 0, node.radius, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }

      // Names: for the pointed note and its neighbours, or for everything once zoomed in.
      ctx.globalAlpha = 1;
      ctx.font = `${12 / v.k}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const left = (-width / 2 - v.x) / v.k;
      const top = (-height / 2 - v.y) / v.k;
      // A local graph of many notes names only its own note until one is pointed at.
      const crowded = Boolean(own) && !v.hovered && nodes.length > 16;
      for (const node of nodes) {
        const show = lit ? (crowded ? node.id === own : isLit(node.id)) : v.k > 1.4;
        if (!show) continue;
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        if (x < left || x > left + width / v.k || y < top || y > top + height / v.k) continue;
        ctx.fillStyle = node.id === center ? text : faint;
        ctx.fillText(node.title, x, y + node.radius + 3 / v.k);
      }
    };

    const step = () => {
      simulation.tick();
      if (v.fitting) fit();
      draw();
      if (simulation.alpha() > simulation.alphaMin()) {
        frame = requestAnimationFrame(step);
      } else {
        running = false;
        setSettled(true);
      }
    };
    v.redraw = () => {
      if (running) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      if (v.fitting) fit();
      if (!running) draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    frame = requestAnimationFrame(step);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      simulation.stop();
    };
  }, [graph, own]);

  // Pointer: hover lights a note up, scroll zooms around the pointer, drag pans, a click opens.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const v = view.current;
    const toGraph = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left - rect.width / 2 - v.x) / v.k,
        y: (event.clientY - rect.top - rect.height / 2 - v.y) / v.k,
      };
    };
    let drag: { x: number; y: number; moved: boolean } | undefined;

    const move = (event: MouseEvent) => {
      if (drag) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        drag = { x: event.clientX, y: event.clientY, moved: drag.moved || Math.abs(dx) + Math.abs(dy) > 3 };
        v.x += dx;
        v.y += dy;
        v.fitting = false;
        v.redraw();
        return;
      }
      const point = toGraph(event);
      const hovered = nodeAt(graph.nodes, point.x, point.y, 4 / v.k)?.id;
      if (hovered === v.hovered) return;
      v.hovered = hovered;
      canvas.style.cursor = hovered ? 'pointer' : 'default';
      setFocus(hovered ?? v.searched);
      v.redraw();
    };
    // The left button drags and clicks, the middle one clicks (into a new tab); the right one is left alone.
    const down = (event: MouseEvent) => {
      if (event.button > 1) return;
      if (event.button === 1) event.preventDefault();
      drag = { x: event.clientX, y: event.clientY, moved: false };
    };
    const up = (event: MouseEvent) => {
      const clicked = drag && !drag.moved;
      drag = undefined;
      if (!clicked || event.button > 1) return;
      const point = toGraph(event);
      const node = nodeAt(graph.nodes, point.x, point.y, 4 / v.k);
      if (node) onOpen(node.id, opensInNewTab(event));
    };
    const leave = () => {
      drag = undefined;
      v.hovered = undefined;
      setFocus(v.searched);
      v.redraw();
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = event.clientX - rect.left - rect.width / 2;
      const my = event.clientY - rect.top - rect.height / 2;
      const k = Math.min(Math.max(v.k * Math.exp(-event.deltaY * 0.0015), MIN_ZOOM), MAX_ZOOM);
      v.x = mx - ((mx - v.x) * k) / v.k;
      v.y = my - ((my - v.y) * k) / v.k;
      v.k = k;
      v.fitting = false;
      v.redraw();
    };
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    canvas.addEventListener('mouseleave', leave);
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      canvas.removeEventListener('mousemove', move);
      canvas.removeEventListener('mousedown', down);
      window.removeEventListener('mouseup', up);
      canvas.removeEventListener('mouseleave', leave);
      canvas.removeEventListener('wheel', wheel);
    };
  }, [graph, onOpen]);

  const search = (value: string) => {
    setQuery(value);
    const v = view.current;
    v.searched = findNode(graph.nodes, value)?.id;
    setFocus(v.hovered ?? v.searched);
    v.redraw();
  };
  const focused = focus ? graph.nodes.find((node) => node.id === focus) : undefined;

  if (local) {
    return (
      <div className="graph is-local" data-testid="local-graph" data-settled={settled} data-focus={focus ?? ''} data-center={local.center} data-nodes={graph.nodes.length} data-links={graph.links.length}>
        <canvas ref={canvasRef} className="graph-canvas" aria-label={`Local graph of ${graph.nodes.length} notes and ${graph.links.length} links`} />
      </div>
    );
  }
  return (
    <div className="graph" data-testid="graph" data-settled={settled} data-focus={focus ?? ''} data-nodes={graph.nodes.length} data-links={graph.links.length}>
      <canvas ref={canvasRef} className="graph-canvas" aria-label={`Graph of ${graph.nodes.length} notes and ${graph.links.length} links`} />
      <div className="graph-legend">
        <p className="eyebrow">
          {graph.nodes.length} notes · {graph.links.length} links
        </p>
        <ul>
          {graph.groups.slice(0, PALETTE_SIZE).map((group, i) => (
            <li key={group.name}>
              <span className="graph-swatch" style={{ background: `var(--graph-${i + 1})` }} />
              {i === PALETTE_SIZE - 1 && graph.groups.length > PALETTE_SIZE ? 'Everything else' : group.name || 'Top of the vault'}
            </li>
          ))}
        </ul>
      </div>
      <form
        className="graph-search"
        onSubmit={(event) => {
          event.preventDefault();
          if (focused) onOpen(focused.id, false);
        }}
      >
        <input value={query} onChange={(event) => search(event.target.value)} placeholder="Find a note" aria-label="Find a note" data-testid="graph-search" />
        {focused && (
          <button type="submit" className="quiet-button" data-testid="graph-open" title={focused.id}>
            Open {focused.title}
          </button>
        )}
      </form>
      <p className="graph-hint">Scroll to zoom · drag to move · click a note to open it</p>
    </div>
  );
}
