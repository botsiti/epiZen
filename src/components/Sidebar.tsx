import { PreferenceIcon } from './settings/icons';
import './workspace/creation.css';
import type { ReactNode } from 'react';
import type { TreeNode } from '../lib/tree';
import { openClicks } from './workspace/clicks';
import type { PluginSettings } from '../lib/plugins';

/** Opens a view; `newTab` for a ⌘-click or a middle click. */
type Open = (newTab: boolean) => void;

interface Props {
  plugins?: PluginSettings;
  vaultName: string;
  tree: TreeNode[];
  selected?: string;
  isFolderOpen: (path: string) => boolean;
  onToggleFolder: (path: string) => void;
  onCollapseFolders: () => void;
  onOpenNote: (path: string, newTab: boolean) => void;
  onHome: Open;
  onNewNote: () => void;
  onNewFolder?: () => void;
  onNewBase?: () => void;
  onOpenFolder: () => void;
  onSettings: Open;
  onGraph: Open;
  onCalendar: Open;
  onLibrary: Open;
  onQuests: Open;
  onStatistics: Open;
  onHabits?: Open;
  onNoteMenu: (path: string, x: number, y: number) => void;
  /** The focus timer while it runs, at the top. */
  timer?: ReactNode;
  /** Why the last folder the user picked couldn't be opened. */
  folderError?: string;
  /** Shown above the notes. */
  calendar?: ReactNode;
}

export function Sidebar(props: Props) {
  const { vaultName, tree, selected, isFolderOpen, onToggleFolder, onCollapseFolders, onOpenNote, onHome, onNewNote, onOpenFolder, onSettings, onGraph, onCalendar, onLibrary, onQuests, onStatistics, onHabits, onNoteMenu, timer, folderError, calendar } = props;

  return (
    <nav className="sidebar" aria-label="Notes">
      <div className="sidebar-head">
        <button type="button" className="vault-name" {...openClicks(onHome)} data-testid="sidebar-vault">
          <img className="app-mark" src="/brand/epizen.png" alt="" />
          {vaultName}
        </button>
      </div>
      {timer}
      {calendar}
      <div className="explorer-tools" role="toolbar" aria-label="File actions"><span>Files</span>        <button type="button" className="icon-button" onClick={onCollapseFolders} title="Collapse all folders (⌃3)" aria-label="Collapse all folders" aria-keyshortcuts="Control+3" data-testid="collapse-folders">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m4 6 4-3 4 3M4 10l4 3 4-3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button type="button" className="icon-button" onClick={onNewNote} title="New note (⌘N)" aria-label="New note" aria-keyshortcuts="Meta+N" data-testid="new-note-button">
          <PreferenceIcon name="note" />
        </button>
        {props.onNewBase && <button type="button" className="icon-button" onClick={props.onNewBase} title="New base or import an Obsidian Base" aria-label="New base" data-testid="new-base-button"><PreferenceIcon name="bases" /></button>}
{props.onNewFolder && <button type="button" className="icon-button" onClick={props.onNewFolder} title="New folder" aria-label="New folder" data-testid="new-folder-button"><PreferenceIcon name="folder" /></button>}</div>
      <ul className="tree" role="tree">
        <TreeItems nodes={tree} depth={0} selected={selected} isOpen={isFolderOpen} toggle={onToggleFolder} onOpenNote={onOpenNote} onNoteMenu={onNoteMenu} />
      </ul>
      <div className="sidebar-foot">
        {props.plugins?.calendar !== false && <button type="button" className="sidebar-action" {...openClicks(onCalendar)} data-testid="open-calendar">
          Calendar
        </button>}
        {props.plugins?.library !== false && <button type="button" className="sidebar-action" {...openClicks(onLibrary)} data-testid="open-library">
          Library
        </button>}
        {props.plugins?.quests !== false && <button type="button" className="sidebar-action" {...openClicks(onQuests)} data-testid="open-quests">Quests</button>}
        {onHabits && props.plugins?.habits !== false && <button type="button" className="sidebar-action" {...openClicks(onHabits)} data-testid="open-habits">Habits</button>}
        {props.plugins?.statistics !== false && <button type="button" className="sidebar-action" {...openClicks(onStatistics)} data-testid="open-statistics">Statistics</button>}
        {props.plugins?.graph !== false && <button type="button" className="sidebar-action" {...openClicks(onGraph)} data-testid="open-graph">
          Graph
        </button>}
        <button type="button" className="sidebar-action" {...openClicks(onSettings)} data-testid="open-settings">
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
  onOpenNote: (path: string, newTab: boolean) => void;
  onNoteMenu: (path: string, x: number, y: number) => void;
}

// Each level indents one chevron's width, so a folder's notes sit under its name.
const STEP = 16;
const CHEVRON = 20;

function TreeItems({ nodes, depth, selected, isOpen, toggle, onOpenNote, onNoteMenu }: ItemsProps) {
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
            {...openClicks((newTab) => onOpenNote(node.path, newTab))}
            onContextMenu={(event) => { event.preventDefault(); onNoteMenu(node.path, event.clientX, event.clientY); }}
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
              onNoteMenu={onNoteMenu}
            />
          </ul>
        )}
      </li>
    );
  });
}
