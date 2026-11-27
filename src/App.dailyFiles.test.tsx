import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './App';
import type { Settings } from './lib/api';
import { builtInPeriodicText, DEFAULT_PERIODIC } from './lib/periodic';
import { newHabit } from './lib/habits';

const root = '/fixture/calendar';
const previous = '2026-11-25.md';
const target = 'Calendar/2026/days 2026/26.11.2026.md';
const command = (key: string, shiftKey = false) => fireEvent.keyDown(window, { key, metaKey: true, shiftKey });

function workspace(extraNotes: [string, string][] = []) {
  const notes = new Map([
    [previous, builtInPeriodicText('day', new Date(2026, 10, 25)) + 'Searchable journal passage.\n'],
    ['Notes/Projects/Idea.md', 'A distinct line from the notebook.'],
    ...extraNotes,
  ]);
  for (const [name, id] of [['Walk', 'walking-habit'], ['Meditate', 'meditation-habit']]) {
    const habit = newHabit(name!, '2026-01-01', id!);
    notes.set(habit.path, habit.text);
  }
  const settings: Settings = { leftSidebarOpen: false, vaults: { [root]: { complete: true, periodic: DEFAULT_PERIODIC, recognition: { preferred: { 'day:2026-11-25': previous } }, plugins: { periodic: true, habits: true, cbt: true } } } };
  mockIPC((command, args) => {
    const { path, text, expected, patch } = args as { path: string; text: string; expected: string; patch: Settings };
    switch (command) {
      case 'vault_status': return { state: 'open', root, name: 'Test', dailyNaming: { folder: 'Calendar', format: 'YYYY/[days ]YYYY/DD.MM.YYYY' } };
      case 'list_files': return [...notes.keys()].map((path) => ({ path, kind: 'note' }));
      case 'read_all_notes': return [...notes].map(([path, text]) => ({ path, text }));
      case 'list_folders': return ['Notes', 'Notes/Projects'];
      case 'list_wallpapers': return [];
      case 'get_settings': return settings;
      case 'update_settings': return Object.assign(settings, patch);
      case 'read_note': return notes.get(path);
      case 'create_note':
        if (notes.has(path)) throw new Error('already exists');
        notes.set(path, text); return;
      case 'write_note_scoped':
      case 'write_note':
        if (expected !== notes.get(path)) throw new Error('changed on disk');
        notes.set(path, text); return;
    }
  }, { shouldMockEvents: true });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn();
  const user = userEvent.setup();
  render(<App />);
  return { notes, settings, user };
}

afterEach(async () => {
  await act(async () => { cleanup(); await Promise.resolve(); });
  clearMocks();
});

it('opens an old ISO note by content, creates its next day in Calendar, and keeps CBT intact after a habit click', async () => {
  const { notes, user } = workspace();
  const before = new Map(notes);
  await screen.findByTestId('markdown-home');
  command('f', true);
  const search = await screen.findByRole('searchbox', { name: 'Search in all files' });
  expect(search).toHaveFocus();
  await user.type(search, 'searchable journal passage{Enter}');
  await waitFor(() => expect(screen.getByTestId('periodic')).toHaveAttribute('data-path', previous));
  await user.click(screen.getByTestId('nav-next'));
  await waitFor(() => expect(screen.getByTestId('periodic')).toHaveAttribute('data-path', target));
  await user.click(screen.getByRole('tab', { name: 'Habits' }));
  const labels = () => screen.getAllByTestId('habit-pill').map((button) => button.dataset.habitId);
  const order = labels();
  const last = screen.getAllByTestId('habit-pill').at(-1)!;
  await user.click(last);
  await waitFor(() => expect(last).toHaveAttribute('aria-pressed', 'true'));
  expect(labels()).toEqual(order);
  await user.click(screen.getByRole('tab', { name: 'CBT' }));
  expect(screen.queryByText(/\[habit::/)).not.toBeInTheDocument();
  expect(notes.get(target)!.indexOf('[!habits]')).toBeLessThan(notes.get(target)!.indexOf('### stream of consc'));
  expect([...notes].filter(([path]) => path !== target)).toEqual([...before]);
});

it('reveals a nested search result and assigns, executes and removes a recent-files shortcut', async () => {
  const { settings, user } = workspace();
  await screen.findByTestId('markdown-home');
  command('f', true);
  await user.type(await screen.findByRole('searchbox'), 'distinct line{Enter}');
  await screen.findByTestId('note-title');
  expect(screen.queryByRole('tree')).toBeNull();
  command('r', true);
  expect(await screen.findByRole('button', { name: 'Idea' })).toHaveFocus();
  command(',');
  await user.click(await screen.findByTestId('settings-nav-hotkeys'));
  const add = screen.getByRole('button', { name: 'Add shortcut for Open recent files' });
  await user.click(add);
  fireEvent.keyDown(add, { key: 'f', shiftKey: true, metaKey: true });
  expect(screen.getByRole('alert')).toHaveTextContent('assigned to Search in all files');
  fireEvent.keyDown(add, { key: 'o', metaKey: true });
  const remove = await screen.findByRole('button', { name: 'Remove ⌘O from Open recent files' });
  expect(settings.fileKeys).toMatchObject({ recentFiles: ['⌘O'] });
  command('o');
  const dialog = await screen.findByRole('dialog', { name: 'Open recent files' });
  expect(within(dialog).getByRole('button', { name: 'Notes/Projects/Idea.md' })).toBeVisible();
  await user.keyboard('{Escape}');
  await user.click(remove);
  await waitFor(() => expect(settings.fileKeys).toMatchObject({ recentFiles: [] }));
  command('o');
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('checks habits in the open copy of a duplicated day and refuses a replaced legacy checkbox', async () => {
  const copy = 'Calendar/2026/days 2026/25.11.2026.md';
  const original = builtInPeriodicText('day', new Date(2026, 10, 25)).replace('done:', 'done: 82')
    + '\n> [!habits]- Habits\n> - [ ] Stretch\n';
  const { notes, user } = workspace([[copy, original]]);
  const preferred = notes.get(previous);
  await screen.findByTestId('markdown-home');
  command('f', true);
  await user.type(await screen.findByRole('searchbox'), '25.11.2026.md{Enter}');
  await user.click(await screen.findByRole('tab', { name: 'Habits' }));
  await user.click(screen.getByRole('button', { name: 'Stretch' }));
  await waitFor(() => expect(notes.get(copy)).toBe(original.replace('[ ] Stretch', '[x] Stretch')));
  await user.click(screen.getByRole('button', { name: 'Walk' }));
  await waitFor(() => expect(notes.get(copy)).toContain('[x] Walk'));
  expect(notes.get(previous)).toBe(preferred);
  const outside = notes.get(copy)!.replace('[x] Stretch', '[x] Different habit');
  notes.set(copy, outside);
  await user.click(screen.getByRole('button', { name: 'Stretch' }));
  await screen.findByText(/That checkbox changed/);
  expect(notes.get(copy)).toBe(outside);
});
