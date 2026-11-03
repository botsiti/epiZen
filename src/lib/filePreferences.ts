import { noteFolder } from './links';

export interface FilePreferences {
  notes: 'current' | 'root' | 'folder';
  noteFolder: string;
  folders: 'current' | 'root' | 'folder';
  folderParent: string;
}
export const DEFAULT_FILE_PREFERENCES: FilePreferences = { notes: 'current', noteFolder: '', folders: 'root', folderParent: '' };
export function folderProblem(path: string): string | undefined {
  if (path && path.split('/').some((part) => !part.trim() || part.startsWith('.') || /[\\:*?"<>|]/.test(part) || [...part].some((character) => character.charCodeAt(0) < 32))) return 'Choose a folder inside this vault, with no hidden folders or ../ segments.';
}
export function filePreferences(value: unknown): FilePreferences {
  const stored = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const mode = (key: 'notes' | 'folders') => ['current', 'root', 'folder'].includes(String(stored[key])) ? stored[key] as FilePreferences['notes'] : DEFAULT_FILE_PREFERENCES[key];
  const path = (key: 'noteFolder' | 'folderParent') => typeof stored[key] === 'string' && !folderProblem(stored[key]) ? stored[key] : '';
  return { notes: mode('notes'), folders: mode('folders'), noteFolder: path('noteFolder'), folderParent: path('folderParent') };
}
export function creationFolder(settings: FilePreferences, kind: 'note' | 'folder', currentNote?: string): string {
  const mode = kind === 'note' ? settings.notes : settings.folders;
  return mode === 'current' ? currentNote ? noteFolder(currentNote) : '' : mode === 'folder' ? kind === 'note' ? settings.noteFolder : settings.folderParent : '';
}
