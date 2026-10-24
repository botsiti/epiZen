import { invoke } from '@tauri-apps/api/core';

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

// Every backend call is a read. There is no command that writes to the vault.
export const vaultStatus = () => invoke<VaultStatus>('vault_status');
export const listFiles = () => invoke<VaultFile[]>('list_files');
export const readNote = (path: string) => invoke<string>('read_note', { path });
export const readImage = (path: string) => invoke<ArrayBuffer>('read_image', { path });
