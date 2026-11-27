import { SHORTCUT_REFERENCE } from './shortcuts';

export const FILE_COMMANDS = [
  { id: 'newFolder', label: 'Create new folder' },
  { id: 'revealCurrent', label: 'Reveal current file in navigation' },
  { id: 'showExplorer', label: 'Show file explorer' },
  { id: 'recentFiles', label: 'Open recent files' },
  { id: 'searchFiles', label: 'Search in all files' },
] as const;
export type FileCommand = typeof FILE_COMMANDS[number]['id'];
export type FileKeys = Record<FileCommand, string[]>;
export const DEFAULT_FILE_KEYS: FileKeys = {
  newFolder: [], revealCurrent: ['⇧⌘R'], showExplorer: [], recentFiles: [], searchFiles: ['⇧⌘F'],
};

/**
 * The letter or sign a key press means for a shortcut. Under a layout that types something else
 * there (Cyrillic, say), the key's place on a US keyboard, as macOS's own menus do.
 */
export function keyOf(event: KeyboardEvent): string {
  if (event.key.length === 1 && event.key.charCodeAt(0) < 128) return event.key.toLowerCase();
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(event.code)) return event.code.slice(5);
  return { BracketLeft: '[', BracketRight: ']', Comma: ',' }[event.code] ?? event.key;
}

export function fileChord(event: KeyboardEvent): string | undefined {
  const key = keyOf(event);
  if (!/^[a-z]$/.test(key) || (!event.ctrlKey && !event.metaKey)) return undefined;
  return (event.ctrlKey ? '⌃' : '') + (event.altKey ? '⌥' : '') + (event.shiftKey ? '⇧' : '') + (event.metaKey ? '⌘' : '') + key.toUpperCase();
}

const reserved = new Set([
  ...SHORTCUT_REFERENCE.flatMap(({ keys }) => keys.split(' / ')),
  '⌘A', '⌘C', '⌘F', '⌘H', '⌘M', '⌘Q', '⌘V', '⌘X', '⇧⌘W', '⌥⌘H', '⌃⌘F',
]);
export function fileKeyProblem(chord: string, keys: FileKeys): string | undefined {
  if (reserved.has(chord)) return 'That shortcut is already used by the editor or workspace.';
  const owner = FILE_COMMANDS.find(({ id }) => keys[id].includes(chord));
  if (owner) return `That shortcut is assigned to ${owner.label}.`;
}

// Validate stored bindings before registering them, including after an app upgrade.
export function readFileKeys(value: unknown): FileKeys {
  const saved = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const result: FileKeys = { newFolder: [], revealCurrent: [], showExplorer: [], recentFiles: [], searchFiles: [] };
  for (const { id } of FILE_COMMANDS) {
    const chords = saved[id];
    for (const chord of Array.isArray(chords) ? chords : DEFAULT_FILE_KEYS[id]) {
      if (typeof chord === 'string' && /^(?=.*[⌃⌘])⌃?⌥?⇧?⌘?[A-Z]$/.test(chord) && !fileKeyProblem(chord, result)) result[id].push(chord);
    }
  }
  return result;
}
