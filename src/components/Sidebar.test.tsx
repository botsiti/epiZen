import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { buildTree } from '../lib/tree';
import { Sidebar } from './Sidebar';
import { useExplorer } from './workspace/useExplorer';
import { useShortcuts } from './workspace/useShortcuts';

vi.mock('../lib/api', () => ({ onMenu: () => Promise.resolve(() => {}) }));
const tree = buildTree(['Notes/Projects/Selected.md', 'Notes/Elsewhere.md', 'Reading/Book.md'].map((path) => ({ kind: 'note', path })));
const noop = () => {};
function Explorer() {
  const [visible, setVisible] = useState(true);
  const explorer = useExplorer(tree, 'Notes/Projects/Selected.md');
  useShortcuts({ newTab: noop, closeTab: noop, toggleLeftSidebar: () => setVisible((shown) => !shown), toggleRightSidebar: noop, toggleAssistant: noop, collapseFolders: explorer.collapseAll, newNote: noop, settings: noop, home: noop, library: noop, today: noop, back: noop, forward: noop, cycle: noop, showTab: noop });
  return <>{visible && <Sidebar vaultName="Test" tree={tree} selected="Notes/Projects/Selected.md" isFolderOpen={explorer.isOpen} onToggleFolder={explorer.toggle} onCollapseFolders={explorer.collapseAll} onOpenNote={noop} onHome={noop} onNewNote={noop} onOpenFolder={noop} onSettings={noop} onGraph={noop} onCalendar={noop} onLibrary={noop} onQuests={noop} onStatistics={noop} onNoteMenu={noop} />}</>;
}

it('collapses selected-note ancestors and nested folders, and retains state across hiding the explorer', () => {
  render(<Explorer />);
  expect(screen.getByRole('button', { name: 'Selected' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Reading' }));
  fireEvent.keyDown(window, { key: '7', metaKey: true });
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: '7', metaKey: true });
  expect(screen.getByRole('button', { name: 'Book' })).toBeVisible();
  fireEvent.keyDown(window, { key: '7', metaKey: true });
  fireEvent.keyDown(window, { key: '3', ctrlKey: true });
  fireEvent.keyDown(window, { key: '7', metaKey: true });
  expect(screen.queryByRole('button', { name: 'Selected' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Book' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
  expect(screen.getByRole('button', { name: 'Projects' }).closest('li')).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
  expect(screen.getByRole('button', { name: 'Selected' }).closest('li')).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Collapse all folders' }));
  expect(screen.queryByRole('button', { name: 'Selected' })).not.toBeInTheDocument();
});
