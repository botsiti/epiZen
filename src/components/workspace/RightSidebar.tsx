import type { ReactNode } from 'react';
import type { Graph } from '../../lib/graph';
import type { Backlink } from '../../lib/linkIndex';
import { noteTitle } from '../../lib/links';
import type { PanelId } from '../../lib/tabs';
import { Backlinks } from '../Backlinks';
import { GraphView } from '../GraphView';
import './workspace.css';

interface Props {
  /** The note the tab in front shows, if it shows one. */
  note?: string;
  backlinks: Backlink[];
  /** The note and its neighbours. */
  graph?: Graph;
  closed: readonly PanelId[];
  onTogglePanel: (panel: PanelId) => void;
  /** `newTab` for a ⌘-click or a middle click. */
  onOpen: (path: string, newTab: boolean) => void;
}

/** Beside the main pane, for the note in front: what links to it, and its local graph. */
export function RightSidebar({ note, backlinks, graph, closed, onTogglePanel, onOpen }: Props) {
  const neighbours = graph ? Math.max(0, graph.nodes.length - 1) : 0;
  return (
    <aside className="right-sidebar" aria-label="About the note in front" data-testid="right-sidebar" data-note={note ?? ''}>
      <div className="right-sidebar-head">
        <p className="eyebrow" title={note}>
          {note ? noteTitle(note) : 'No note in front'}
        </p>
      </div>
      <Panel id="backlinks" title="Backlinks" count={note ? backlinks.length : undefined} open={!closed.includes('backlinks')} onToggle={onTogglePanel}>
        {note ? <Backlinks links={backlinks} onOpen={onOpen} /> : <p className="panel-quiet">Open a note to see what links to it.</p>}
      </Panel>
      <Panel id="graph" title="Local graph" count={note && graph ? neighbours : undefined} open={!closed.includes('graph')} onToggle={onTogglePanel}>
        {note && graph ? (
          <>
            <GraphView key={note} graph={graph} onOpen={onOpen} local={{ center: note }} />
            <p className="panel-hint">{neighbours ? 'Its linked notes · ⌘-click opens a new tab' : 'No links to or from this note yet.'}</p>
          </>
        ) : (
          <p className="panel-quiet">Open a note to see its neighbours.</p>
        )}
      </Panel>
    </aside>
  );
}

interface PanelProps {
  id: PanelId;
  title: string;
  count?: number;
  open: boolean;
  onToggle: (panel: PanelId) => void;
  children: ReactNode;
}

function Panel({ id, title, count, open, onToggle, children }: PanelProps) {
  return (
    <section className={open ? 'panel is-open' : 'panel'} data-testid="panel" data-panel={id}>
      <button type="button" className="panel-head" onClick={() => onToggle(id)} aria-expanded={open} data-testid="panel-toggle" data-panel={id}>
        <span className={open ? 'chevron is-open' : 'chevron'} aria-hidden="true" />
        <span className="panel-title">{title}</span>
        {count !== undefined && <span className="panel-count">{count}</span>}
      </button>
      {open && <div className="panel-body">{children}</div>}
    </section>
  );
}
