import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

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
export const openVault = (path: string) => invoke<VaultStatus>('open_vault', { path });
export const listFiles = () => invoke<VaultFile[]>('list_files');
export const readNote = (path: string) => invoke<string>('read_note', { path });
export const readImage = (path: string) => invoke<ArrayBuffer>('read_image', { path });

// The only two writes. Both go through src-tauri/src/vault.rs: a new note never replaces a
// file, and a note's text is replaced only while it still holds `expected`.
export const createNote = (path: string, text: string) => invoke<void>('create_note', { path, text });
export const writeNote = (path: string, text: string, expected: string) =>
  invoke<void>('write_note', { path, text, expected });

export const getSettings = () => invoke<Settings>('get_settings');
/** Merges by top-level key; `null` removes a key. Returns every setting. */
export const updateSettings = (patch: Settings) => invoke<Settings>('update_settings', { patch });

/** The system's folder picker. Resolves to `null` when the user cancels. */
export const pickFolder = () => open({ directory: true, multiple: false, title: 'Open a vault' });
