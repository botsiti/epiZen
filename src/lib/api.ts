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

// The menu bar item and its panel (src-tauri/src/tray.rs). The main window publishes the timer
// for both, and gets the panel's buttons back as commands; the panel shows what was published.

/** The main window's timer, for the item's title and tooltip and for the panel (src/lib/tray.ts). */
export const publishTray = (status: { clock: unknown; tooltip: string; panel: unknown }) => invoke<void>('tray_publish', { status });
/** In the main window: a command from one of the panel's buttons, unchecked. */
export const onTrayCommand = (handler: (command: unknown) => void) => listen<unknown>('epizen://tray-command', (event) => handler(event.payload));
/** In the main window: the round or rest it published has run out, though its own timers may be held back. */
export const onTimerDue = (handler: () => void) => listen('epizen://timer-due', handler);
/** In the panel: what the main window last published; `null` before it has. */
export const trayState = () => invoke<unknown>('tray_state');
export const onTrayState = (handler: (panel: unknown) => void) => listen<unknown>('epizen://tray-state', (event) => handler(event.payload));
/** The panel has just been shown: it refreshes, and the main window looks at the date again. */
export const onTrayShown = (handler: () => void) => listen('epizen://tray-shown', handler);
export const trayCommand = (command: unknown) => invoke<void>('tray_command', { command });
/** Brings the main window to the front, and hides the panel. */
export const openMainWindow = () => invoke<void>('tray_open_main');
export const hideTray = () => invoke<void>('tray_hide');
/** Quits as ⌘Q does, after the editor's last save. */
export const quitApp = () => invoke<void>('tray_quit');

/** An item of the menu bar the page acts on (src-tauri/src/menu.rs). */
export type MenuItemId = 'new-tab' | 'close-tab' | 'right-sidebar';

/** Calls `handler` when one of those items is chosen. Returns a function that stops listening. */
export async function onMenu(handler: (item: MenuItemId) => void): Promise<() => void> {
  return listen<MenuItemId>('epizen://menu', (event) => handler(event.payload));
}


// Apple Calendar, through EventKit (src-tauri/src/calendar.rs). Nothing here touches the vault.
// Times are milliseconds since the epoch; an occurrence is an event's id and where it starts.

/** Mirrors `Access` in src-tauri/src/calendar.rs. */
export type CalendarAccess = 'unknown' | 'allowed' | 'denied';

/** Mirrors `CalendarInfo`. */
export interface CalendarInfo {
  id: string;
  title: string;
  /** `#rrggbb`. */
  color: string;
  writable: boolean;
  /** Where the system puts a new event. */
  default: boolean;
}

/** Mirrors `Event`. */
export interface CalendarEvent {
  id: string;
  calendar: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  /** Where Senioro and Epizen put the task's words; the title is its category. */
  notes?: string | null;
  url?: string | null;
  writable: boolean;
}

export interface NewCalendarEvent {
  calendar: string;
  title: string;
  start: number;
  end: number;
  notes?: string;
  url?: string;
}

export type Occurrence = Pick<CalendarEvent, 'id' | 'start'>;

export const calendarAccess = () => invoke<CalendarAccess>('calendar_access');
/** Shows the system's prompt the first time, and resolves with the answer. */
export const requestCalendarAccess = () => invoke<CalendarAccess>('calendar_request_access');
export const listCalendars = () => invoke<CalendarInfo[]>('calendar_list');
export const calendarEvents = (from: number, to: number) => invoke<CalendarEvent[]>('calendar_events', { from, to });
export const createEvent = (event: NewCalendarEvent) => invoke<CalendarEvent>('calendar_create', { event });
export const updateEvent = (at: Occurrence, change: { start?: number; end?: number; title?: string; notes?: string }) =>
  invoke<CalendarEvent>('calendar_update', { at: { id: at.id, start: at.start }, change });
export const deleteEvent = (at: Occurrence) => invoke<void>('calendar_delete', { at: { id: at.id, start: at.start } });
/** System Settings, at Privacy & Security, Calendars. */
export const openCalendarSettings = () => invoke<void>('calendar_open_settings');
