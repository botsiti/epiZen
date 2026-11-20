import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { buildTree } from '../lib/tree';
import { Sidebar } from './Sidebar';
import { useExplorer } from './workspace/useExplorer';
import { useShortcuts } from './workspace/useShortcuts';

vi.mock('../lib/api', () => ({ onMenu: () => Promise.resolve(() => {}) }));
const tree = buildTree(['Notes/Projects/Selected.md', 'Notes/Elsewhere.md', 'Reading/Book.md', 'Habits/Walk.md', 'Templates/Daily.md', 'Notes/Templates/Example.md'].map((path) => ({ kind: 'note', path })));
const noop = () => {};
function Explorer({ onCreateFolder, onMoveNote }: Pick<Parameters<typeof Sidebar>[0], 'onCreateFolder' | 'onMoveNote'> = {}) {
  const [visible, setVisible] = useState(true);
  const explorer = useExplorer(tree, 'Notes/Projects/Selected.md');
  useShortcuts({ newTab: noop, closeTab: noop, closeOthers: noop, editNote: noop, toggleLeftSidebar: () => setVisible((shown) => !shown), toggleRightSidebar: noop, toggleAssistant: noop, collapseFolders: explorer.collapseAll, newNote: noop, settings: noop, home: noop, library: noop, today: noop, back: noop, forward: noop, cycle: noop, showTab: noop });
  return <>{visible && <Sidebar onCreateFolder={onCreateFolder} onMoveNote={onMoveNote} folderParent="Notes" vaultName="Test" tree={tree} selected="Notes/Projects/Selected.md" isFolderOpen={explorer.isOpen} onToggleFolder={explorer.toggle} onCollapseFolders={explorer.collapseAll} onOpenNote={noop} onHome={noop} onNewNote={noop} onOpenFolder={noop} onSettings={noop} onGraph={noop} onCalendar={noop} onLibrary={noop} onQuests={noop} onStatistics={noop} onNoteMenu={noop} />}</>;
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

it('hides only the root habit and template folders from Files', () => {
  render(<Explorer />);
  const visible = screen.getAllByTestId('tree-folder').map((node) => node.dataset.path);
  expect(visible).not.toContain('Habits');
  expect(visible).not.toContain('Templates');
  expect(visible).toContain('Notes/Templates');
});

it('creates a named folder inline and retains the draft after a collision', async () => {
  const user = userEvent.setup();
  const create = vi.fn().mockRejectedValueOnce(new Error('Already exists')).mockResolvedValueOnce(undefined);
  render(<Explorer onCreateFolder={create} />);
  const button = screen.getByRole('button', { name: 'New folder' });
  await user.click(button);
  const input = screen.getByRole('textbox', { name: 'Folder name' });
  expect(input).toHaveFocus();
  expect(input).toHaveValue('Untitled folder');
  expect((input as HTMLInputElement).selectionEnd).toBe('Untitled folder'.length);
  await user.keyboard('Projects');
  await user.keyboard('{Enter}');
  expect(await screen.findByRole('alert')).toHaveTextContent('Already exists');
  expect(input).toHaveValue('Projects');
  await user.clear(input); await user.type(input, 'Memo');
  await user.click(screen.getByRole('button', { name: 'Create folder' }));
  expect(create.mock.calls).toEqual([['Notes/Projects'], ['Notes/Memo']]);
  expect(screen.queryByRole('textbox', { name: 'Folder name' })).not.toBeInTheDocument();
  expect(button).toHaveFocus();
  await user.click(button); await user.keyboard('{Escape}');
  expect(create).toHaveBeenCalledTimes(2);
});

it('accepts a drag from this explorer and ignores foreign and same-folder drops', () => {
  const move = vi.fn();
  render(<Explorer onMoveNote={move} />);
  const data = new Map<string, string>();
  const transfer = { get types() { return [...data.keys()]; }, setData: (type: string, value: string) => data.set(type, value), getData: (type: string) => data.get(type) };
  const source = screen.getByRole('button', { name: 'Selected' });
  const target = screen.getByRole('button', { name: 'Reading' });
  fireEvent.drop(target, { dataTransfer: transfer });
  fireEvent.dragStart(source, { dataTransfer: transfer });
  fireEvent.drop(screen.getByRole('button', { name: 'Projects' }), { dataTransfer: transfer });
  expect(move).not.toHaveBeenCalled();
  fireEvent.dragOver(target, { dataTransfer: transfer });
  expect(target).toHaveClass('is-drop-target');
  fireEvent.drop(target, { dataTransfer: transfer });
  expect(move).toHaveBeenCalledExactlyOnceWith('Notes/Projects/Selected.md', 'Reading');
  expect(target).not.toHaveClass('is-drop-target');
  fireEvent.dragStart(source, { dataTransfer: transfer });
  fireEvent.drop(screen.getByTestId('tree-root-drop'), { dataTransfer: transfer });
  expect(move).toHaveBeenLastCalledWith('Notes/Projects/Selected.md', '');
});
