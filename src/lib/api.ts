import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** Mirrors `VaultStatus` in src-tauri/src/lib.rs. */
export type VaultStatus =
  | { state: 'none' }
  | { state: 'open'; name: string }
  | { state: 'error'; message: string };

/** Mirrors `VaultFile` in src-tauri/src/vault.rs. Paths are vault-relative with `/`. */
export interface VaultFile {
  path: string;
  kind: 'note' | 'image';
}

/** The app's own settings, kept in its config folder (src-tauri/src/settings.rs), never in the vault. */
export type Settings = Record<string, unknown>;

export const vaultStatus = () => invoke<VaultStatus>('vault_status');
/** Shows the system's folder picker and opens the folder picked. `null` when the user cancels. */
export const pickVault = () => invoke<VaultStatus | null>('pick_vault');
export const listFiles = () => invoke<VaultFile[]>('list_files');
export const readNote = (path: string) => invoke<string>('read_note', { path });
export const readImage = (path: string) => invoke<ArrayBuffer>('read_image', { path });

/** Mirrors `NoteText` in src-tauri/src/vault.rs. */
export interface NoteText {
  path: string;
  text: string;
}
/** Every note's text in one call. A note that isn't UTF-8 text is left out. */
export const readAllNotes = () => invoke<NoteText[]>('read_all_notes');

// The only two writes. Both go through src-tauri/src/vault.rs: a new note never replaces a
// file, and a note's text is replaced only while it still holds `expected`.
export const createNote = (path: string, text: string) => invoke<void>('create_note', { path, text });
export const writeNote = (path: string, text: string, expected: string) =>
  invoke<void>('write_note', { path, text, expected });

export const getSettings = () => invoke<Settings>('get_settings');
/** Merges by top-level key; `null` removes a key. Returns every setting. */
export const updateSettings = (patch: Settings) => invoke<Settings>('update_settings', { patch });

/**
 * Closing the window or quitting waits for the app: `handler` runs on each attempt and calls
 * `closeNow` when the editor's saves are done. Returns a function that stops listening.
 */
export async function guardClose(handler: () => void): Promise<() => void> {
  const stop = await listen('epizen://close-requested', handler);
  await invoke('guard_close', { on: true });
  // When the page stops listening (it unmounts, or a crash takes it down), closing works as usual again.
  return () => {
    stop();
    void invoke('guard_close', { on: false });
  };
}
export const closeNow = () => invoke<void>('close_now');

