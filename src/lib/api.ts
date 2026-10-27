import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** Mirrors `VaultStatus` in src-tauri/src/lib.rs. */
export type VaultStatus =
  | { state: 'none' }
  /** `root` is the vault's canonical folder, which tells two vaults with one name apart. */
  | { state: 'open'; name: string; root: string }
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

// The note writes. Both go through src-tauri/src/vault.rs: a new note never replaces a file, and
// a note's text is replaced only while it still holds `expected`. (The third write, a cover, is below.)
export const createNote = (path: string, text: string) => invoke<void>('create_note', { path, text });
export const writeNote = (path: string, text: string, expected: string) =>
  invoke<void>('write_note', { path, text, expected });

// The library's lookups (src-tauri/src/net.rs): https only, to MusicBrainz, the Cover Art Archive,
// iTunes and Open Library. Anything else is refused there. Nothing goes out unless the user searches.
export const lookupJson = (url: string) => invoke<unknown>('lookup_json', { url });
/** A cover to show in the search results; nothing is saved. */
export const lookupImage = (url: string) => invoke<ArrayBuffer>('lookup_image', { url });
/** Saves a cover as a new image in the vault, never over a file. Returns the path it got (its extension is what the image is). */
export const fetchImageIntoVault = (url: string, path: string) => invoke<string>('fetch_image_into_vault', { url, path });

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

