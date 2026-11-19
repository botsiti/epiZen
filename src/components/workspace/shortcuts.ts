/** Shared by the keyboard handler and the reference in Settings. */
export const SHORTCUTS = [
  { action: 'collapseFolders', label: 'Collapse all folders', key: '3', control: true, keys: '⌃3' },
  { action: 'toggleLeftSidebar', label: 'Toggle left sidebar', key: '7', keys: '⌘7' },
  { action: 'toggleAssistant', label: 'Toggle Spike sidebar', key: '8', keys: '⌘8' },
  { action: 'toggleRightSidebar', label: 'Toggle right sidebar', key: '9', keys: '⌘9' },
  { action: 'toggleRightSidebar', label: 'Toggle right sidebar (alternate)', key: 'b', alt: true, keys: '⌥⌘B' },
  { action: 'newNote', label: 'New note', key: 'n', keys: '⌘N' },
  { action: 'settings', label: 'Open Settings', key: ',', keys: '⌘,' },
  { action: 'home', label: 'Open Home', key: 'h', shift: true, keys: '⇧⌘H' },
  { action: 'library', label: 'Open Library', key: 'l', shift: true, keys: '⇧⌘L' },
  { action: 'today', label: 'Open today’s daily note', key: 'd', shift: true, keys: '⇧⌘D' },
  { action: 'newTab', label: 'New tab', key: 't', keys: '⌘T' },
  { action: 'closeTab', label: 'Close current tab', key: 'w', keys: '⌘W' },
] as const satisfies readonly { action: string; label: string; key: string; keys: string; control?: boolean; alt?: boolean; shift?: boolean }[];

export type ShortcutAction = typeof SHORTCUTS[number]['action'];

const shortcutGroup: Record<ShortcutAction, string> = {
  collapseFolders: 'Workspace', toggleLeftSidebar: 'Workspace', toggleRightSidebar: 'Workspace', toggleAssistant: 'Spike',
  newNote: 'Workspace', settings: 'Navigation', home: 'Navigation', library: 'Navigation', today: 'Navigation',
  newTab: 'Tabs', closeTab: 'Tabs',
};
export const SHORTCUT_REFERENCE = [
  ...SHORTCUTS.map((item) => ({ ...item, group: shortcutGroup[item.action] })),
  { group: 'Spike', label: 'Spike quick prompt (global, while plugin enabled)', keys: '⇧⌘Space' },
  { group: 'Spike', label: 'Spike dictation (global, start / finish)', keys: '⌥⇧⌘Space' },
  { group: 'Tabs', label: 'Previous tab', keys: '⇧⌃Tab / ⇧⌘[' },
  { group: 'Tabs', label: 'Next tab', keys: '⌃Tab / ⇧⌘]' },
  { group: 'Tabs', label: 'Go to tab 1–8', keys: '⌥⌘1–8' },
  { group: 'Tabs', label: 'Go to last tab', keys: '⌥⌘9' },
  { group: 'Tabs', label: 'Go to tab 1–6 (alternate)', keys: '⌘1–6' },
  { group: 'Navigation', label: 'Back in tab history (outside text fields)', keys: '⌘[' },
  { group: 'Navigation', label: 'Forward in tab history (outside text fields)', keys: '⌘]' },
];
