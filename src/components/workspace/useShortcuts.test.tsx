import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onMenu, type MenuItemId } from '../../lib/api';
import { useShortcuts, type ShortcutActions } from './useShortcuts';

vi.mock('../../lib/api', () => ({ onMenu: vi.fn() }));
let menu: (item: MenuItemId) => void;
const stop = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(onMenu).mockImplementation((handler) => { menu = handler; return Promise.resolve(stop); });
});
function actions(): ShortcutActions {
  return {
    newTab: vi.fn(), closeTab: vi.fn(), toggleLeftSidebar: vi.fn(), toggleRightSidebar: vi.fn(), collapseFolders: vi.fn(),
    newNote: vi.fn(), settings: vi.fn(), home: vi.fn(), library: vi.fn(), today: vi.fn(), back: vi.fn(), forward: vi.fn(), cycle: vi.fn(), showTab: vi.fn(),
  };
}
const command = (key: string, options: KeyboardEventInit = {}) => fireEvent.keyDown(window, { key, metaKey: true, ...options });

describe('workspace shortcuts', () => {
  it('keeps keyboard commands working if the native menu listener is unavailable', async () => {
    const callbacks = actions();
    vi.mocked(onMenu).mockRejectedValueOnce(new Error('Menu events unavailable'));
    renderHook(() => useShortcuts(callbacks));
    await act(async () => { await Promise.resolve(); });
    command('7'); command('t');
    expect(callbacks.toggleLeftSidebar).toHaveBeenCalledOnce();
    expect(callbacks.newTab).toHaveBeenCalledOnce();
  });

  it('reserves Command 7 and 9 for sidebars, Control 3 for folders, and keeps all tabs reachable', () => {
    const act = actions();
    renderHook(() => useShortcuts(act));
    command('7'); command('9'); command('3', { metaKey: false, ctrlKey: true });
    expect(act.toggleLeftSidebar).toHaveBeenCalledOnce();
    expect(act.toggleRightSidebar).toHaveBeenCalledOnce();
    expect(act.collapseFolders).toHaveBeenCalledOnce();
    expect(act.showTab).not.toHaveBeenCalled();
    command('3'); command('7', { altKey: true }); command('9', { altKey: true });
    expect(act.showTab).toHaveBeenNthCalledWith(1, 2);
    expect(act.showTab).toHaveBeenNthCalledWith(2, 6);
    expect(act.showTab).toHaveBeenNthCalledWith(3, Infinity);
    command('b', { altKey: true });
    expect(act.toggleRightSidebar).toHaveBeenCalledTimes(2);
  });

  it('opens useful destinations and a new-note form with exact modifiers, including Cyrillic layouts', () => {
    const act = actions();
    renderHook(() => useShortcuts(act));
    command('т', { code: 'KeyN' }); command('б', { code: 'Comma' });
    command('р', { code: 'KeyH', shiftKey: true });
    command('д', { code: 'KeyL', shiftKey: true });
    command('в', { code: 'KeyD', shiftKey: true });
    for (const name of ['newNote', 'settings', 'home', 'library', 'today'] as const) expect(act[name]).toHaveBeenCalledOnce();
    command('n', { shiftKey: true }); command('7', { ctrlKey: true }); command('3', { metaKey: false, ctrlKey: true, shiftKey: true });
    expect(act.newNote).toHaveBeenCalledOnce();
    expect(act.toggleLeftSidebar).not.toHaveBeenCalled();
    expect(act.collapseFolders).not.toHaveBeenCalled();
  });

  it('preserves editing keys, consumed events, composition and repeat while allowing sidebar keys in fields', () => {
    const act = actions();
    renderHook(() => useShortcuts(act));
    render(<><input aria-label="Title" /><div contentEditable suppressContentEditableWarning><span>Editor</span></div></>);
    expect(fireEvent.keyDown(screen.getByRole('textbox'), { key: '[', metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(screen.getByText('Editor'), { key: ']', metaKey: true })).toBe(true);
    expect(act.back).not.toHaveBeenCalled(); expect(act.forward).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: '7', metaKey: true });
    command('7', { repeat: true }); command('7', { isComposing: true });
    const handled = new KeyboardEvent('keydown', { key: '7', metaKey: true, cancelable: true });
    handled.preventDefault(); window.dispatchEvent(handled);
    expect(act.toggleLeftSidebar).toHaveBeenCalledOnce();
    command('['); command(']');
    expect(act.back).toHaveBeenCalledOnce(); expect(act.forward).toHaveBeenCalledOnce();
  });

  it('blocks keyboard and native menu navigation during a modal and before a vault is ready', () => {
    const act = actions();
    const hook = renderHook(({ enabled }) => useShortcuts(act, enabled), { initialProps: { enabled: false } });
    command('n'); menu('new-note');
    expect(act.newNote).not.toHaveBeenCalled();
    hook.rerender({ enabled: true });
    const dialog = render(<div role="dialog" aria-modal="true">Draft</div>);
    expect(command('w')).toBe(false);
    command('7'); command('9'); command('n'); command('Tab', { metaKey: false, ctrlKey: true });
    menu('left-sidebar'); menu('right-sidebar'); menu('today');
    for (const callback of Object.values(act)) expect(callback).not.toHaveBeenCalled();
    dialog.unmount();
    command('7'); menu('today');
    expect(act.toggleLeftSidebar).toHaveBeenCalledOnce(); expect(act.today).toHaveBeenCalledOnce();
  });

  it('routes native menu commands, uses current callbacks, and cleans up listeners', async () => {
    const first = actions(); const next = actions();
    const hook = renderHook(({ callbacks }) => useShortcuts(callbacks), { initialProps: { callbacks: first } });
    await act(async () => {});
    hook.rerender({ callbacks: next });
    for (const id of ['left-sidebar', 'right-sidebar', 'collapse-folders', 'new-note', 'settings', 'home', 'library', 'today', 'new-tab', 'close-tab'] as const) menu(id);
    for (const callback of Object.values(first)) expect(callback).not.toHaveBeenCalled();
    expect(next.closeTab).toHaveBeenCalledOnce(); expect(next.collapseFolders).toHaveBeenCalledOnce();
    expect(next.newNote).toHaveBeenCalledOnce(); expect(next.settings).toHaveBeenCalledOnce();
    hook.unmount();
    command('w');
    expect(next.closeTab).toHaveBeenCalledOnce(); expect(stop).toHaveBeenCalledOnce();
  });

  it('retains tab cycling and releases a menu subscription that resolves after unmount', async () => {
    const act = actions();
    let resolve!: (stop: () => void) => void;
    vi.mocked(onMenu).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const hook = renderHook(() => useShortcuts(act));
    command('Tab', { ctrlKey: true, metaKey: false });
    command('Tab', { ctrlKey: true, metaKey: false, shiftKey: true });
    command('{', { shiftKey: true }); command('}', { shiftKey: true });
    expect(vi.mocked(act.cycle).mock.calls).toEqual([[1], [-1], [-1], [1]]);
    hook.unmount(); resolve(stop);
    await Promise.resolve();
    expect(stop).toHaveBeenCalledOnce();
  });
});
