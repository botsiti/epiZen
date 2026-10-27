import { useState, type ReactNode } from 'react';
import type { TreeNode } from '../lib/tree';

interface Props {
  vaultName: string;
  tree: TreeNode[];
  selected?: string;
  onOpenNote: (path: string) => void;
  onHome: () => void;
  onNewNote: () => void;
  onOpenFolder: () => void;
  onSettings: () => void;
  onGraph: () => void;
  onCalendar: () => void;
  /** The focus timer while it runs, at the top. */
  timer?: ReactNode;
  /** Why the last folder the user picked couldn't be opened. */
  folderError?: string;
  /** Shown above the notes. */
  calendar?: ReactNode;
}

export function Sidebar(props: Props) {
  const { vaultName, tree, selected, onOpenNote, onHome, onNewNote, onOpenFolder, onSettings, onGraph, onCalendar, timer, folderError, calendar } = props;
  // Folders the user opened or closed by hand. Untouched folders open when they hold the selected note.
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const isOpen = (path: string) => toggled.get(path) ?? Boolean(selected?.startsWith(`${path}/`));
  const toggle = (path: string) => setToggled((prev) => new Map(prev).set(path, !isOpen(path)));

  return (
    <nav className="sidebar" aria-label="Notes">
      <div className="sidebar-head">
        <button type="button" className="vault-name" onClick={onHome} data-testid="sidebar-vault">
          {vaultName}
        </button>
        <button type="button" className="icon-button" onClick={onNewNote} title="New note" aria-label="New note" data-testid="new-note-button">
          +
        </button>
      </div>
      {timer}
      {calendar}
      <ul className="tree" role="tree">
        <TreeItems nodes={tree} depth={0} selected={selected} isOpen={isOpen} toggle={toggle} onOpenNote={onOpenNote} />
      </ul>
      <div className="sidebar-foot">
        <button type="button" className="sidebar-action" onClick={onCalendar} data-testid="open-calendar">
          Calendar
        </button>
        <button type="button" className="sidebar-action" onClick={onGraph} data-testid="open-graph">
          Graph
        </button>
        <button type="button" className="sidebar-action" onClick={onSettings} data-testid="open-settings">
          Settings
        </button>
        <button type="button" className="sidebar-action" onClick={onOpenFolder} data-testid="open-folder">
          Open another vault…
        </button>
        {folderError && <p className="sidebar-error">{folderError}</p>}
      </div>
    </nav>
  );
}

interface ItemsProps {
  nodes: TreeNode[];
  depth: number;
  selected?: string;
  isOpen: (path: string) => boolean;
  toggle: (path: string) => void;
  onOpenNote: (path: string) => void;
}

// Each level indents one chevron's width, so a folder's notes sit under its name.
const STEP = 16;
const CHEVRON = 20;

function TreeItems({ nodes, depth, selected, isOpen, toggle, onOpenNote }: ItemsProps) {
  const indent = { paddingLeft: `${12 + depth * STEP}px` };
  return nodes.map((node) => {
    if (node.kind === 'note') {
      const current = node.path === selected;
      return (
        <li key={node.path} role="treeitem" aria-selected={current}>
          <button
            type="button"
            className={current ? 'tree-row is-selected' : 'tree-row'}
            style={{ paddingLeft: `${12 + depth * STEP + CHEVRON}px` }}
            title={node.name}
            onClick={() => onOpenNote(node.path)}
            data-testid="tree-note"
            data-path={node.path}
          >
            <span className="tree-label">{node.name}</span>
          </button>
        </li>
      );
    }
    const open = isOpen(node.path);
    return (
      <li key={node.path} role="treeitem" aria-expanded={open} aria-selected={false}>
        <button
          type="button"
          className="tree-row tree-folder"
          style={indent}
          onClick={() => toggle(node.path)}
          data-testid="tree-folder"
          data-path={node.path}
          data-open={open}
        >
          <span className={open ? 'chevron is-open' : 'chevron'} aria-hidden="true" />
          <span className="tree-label">{node.name}</span>
        </button>
        {open && (
          <ul role="group">
            <TreeItems
              nodes={node.children}
              depth={depth + 1}
              selected={selected}
              isOpen={isOpen}
              toggle={toggle}
              onOpenNote={onOpenNote}
            />
          </ul>
        )}
      </li>
    );
  });
}
