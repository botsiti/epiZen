import { useState } from 'react';
import type { TreeNode } from '../lib/tree';

interface Props {
  vaultName: string;
  tree: TreeNode[];
  selected?: string;
  onOpenNote: (path: string) => void;
  onHome: () => void;
}

export function Sidebar({ vaultName, tree, selected, onOpenNote, onHome }: Props) {
  // Folders the user opened or closed by hand. Untouched folders open when they hold the selected note.
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const isOpen = (path: string) => toggled.get(path) ?? Boolean(selected?.startsWith(`${path}/`));
  const toggle = (path: string) => setToggled((prev) => new Map(prev).set(path, !isOpen(path)));

  return (
    <nav className="sidebar" aria-label="Notes">
      <button type="button" className="vault-name" onClick={onHome} data-testid="sidebar-vault">
        {vaultName}
      </button>
      <ul className="tree" role="tree">
        <TreeItems nodes={tree} depth={0} selected={selected} isOpen={isOpen} toggle={toggle} onOpenNote={onOpenNote} />
      </ul>
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
