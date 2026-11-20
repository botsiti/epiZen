import { noteFolder } from './links';

export const LINK_FORMATS = ['shortest', 'relative', 'vault'] as const;

export interface FilePreferences {
  notes: 'current' | 'root' | 'folder';
  noteFolder: string;
  folders: 'current' | 'root' | 'folder';
  folderParent: string;
  attachments: 'subfolder' | 'current' | 'root' | 'folder';
  attachmentFolder: string;
  linkFormat: typeof LINK_FORMATS[number];
  wikilinks: boolean;
  updateLinks: boolean;
}
export const DEFAULT_FILE_PREFERENCES: FilePreferences = {
  notes: 'current', noteFolder: '', folders: 'root', folderParent: '',
  attachments: 'subfolder', attachmentFolder: '', linkFormat: 'shortest', wikilinks: true, updateLinks: true,
};
export function folderProblem(path: string): string | undefined {
  if (path && path.split('/').some((part) => !part.trim() || part.startsWith('.') || /[\\:*?"<>|]/.test(part) || [...part].some((character) => character.charCodeAt(0) < 32))) return 'Choose a folder inside this vault, with no hidden folders or ../ segments.';
}
export function filePreferences(value: unknown): FilePreferences {
  const stored = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const mode = (key: 'notes' | 'folders') => ['current', 'root', 'folder'].includes(String(stored[key])) ? stored[key] as FilePreferences['notes'] : DEFAULT_FILE_PREFERENCES[key];
  const path = (key: 'noteFolder' | 'folderParent' | 'attachmentFolder') => typeof stored[key] === 'string' && !folderProblem(stored[key]) ? stored[key] : '';
  const attachments = stored.attachments === 'root' || stored.attachments === 'current' || stored.attachments === 'folder' ? stored.attachments : 'subfolder';
  const linkFormat = stored.linkFormat === 'relative' || stored.linkFormat === 'vault' ? stored.linkFormat : 'shortest';
  return {
    notes: mode('notes'), folders: mode('folders'), noteFolder: path('noteFolder'), folderParent: path('folderParent'),
    attachments, attachmentFolder: path('attachmentFolder'), linkFormat, wikilinks: stored.wikilinks !== false, updateLinks: stored.updateLinks !== false,
  };
}

/** An undefined override uses the note's existing _attachments convention. */
export function attachmentLocation(settings: FilePreferences, note: string): string | undefined {
  if (settings.attachments === 'subfolder') return undefined;
  if (settings.attachments === 'current') return noteFolder(note);
  return settings.attachments === 'folder' ? settings.attachmentFolder : '';
}
export function creationFolder(settings: FilePreferences, kind: 'note' | 'folder', currentNote?: string): string {
  const mode = kind === 'note' ? settings.notes : settings.folders;
  return mode === 'current' ? currentNote ? noteFolder(currentNote) : '' : mode === 'folder' ? kind === 'note' ? settings.noteFolder : settings.folderParent : '';
}
