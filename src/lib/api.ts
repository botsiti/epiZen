import type { VoiceProvider, VoiceSettings } from './assistant/voice';
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
  kind: 'note' | 'base' | 'image' | 'attachment';
  /** File timestamps in Unix milliseconds; absent when unavailable. */
  created?: number;
  modified?: number;
  size?: number;
}

/** The app's own settings, kept in its config folder (src-tauri/src/settings.rs), never in the vault. */
export type Settings = Record<string, unknown>;

export const vaultStatus = () => invoke<VaultStatus>('vault_status');
/** Shows the system's folder picker and opens the folder picked. `null` when the user cancels. */
export const pickVault = () => invoke<VaultStatus | null>('pick_vault');
export const listFiles = () => invoke<VaultFile[]>('list_files');
export const listFolders = () => invoke<string[]>('list_folders');
export const createFolder = (path: string) => invoke<void>('create_folder', { path });
export const readNote = (path: string) => invoke<string>('read_note', { path });
export const readBase = (root: string, path: string) => invoke<string>('read_base', { root, path });
export const createBase = (root: string, path: string, text: string) => invoke<void>('create_base', { root, path, text });
export const writeBase = (root: string, path: string, text: string, expected: string) => invoke<void>('write_base', { root, path, text, expected });
export const writeNoteScoped = (root: string, path: string, text: string, expected: string) => invoke<void>('write_note_scoped', { root, path, text, expected });
export const readImage = (path: string) => invoke<ArrayBuffer>('read_image', { path });
export const revealFile = (root: string, path: string) => invoke<void>('reveal_file', { root, path });
/** Saves a selected image beside this note without replacing any existing file. */
export const saveExpensePhoto = (root: string, notePath: string, bytes: Uint8Array) =>
  invoke<string>('save_expense_photo', { root, notePath, bytes: Array.from(bytes) });

/** Mirrors `NoteText` in src-tauri/src/vault.rs. */
export interface NoteText {
  path: string;
  text: string;
}
/** Every note's text in one call. A note that isn't UTF-8 text is left out. */
export const readAllNotes = () => invoke<NoteText[]>('read_all_notes');

// The note writes go through src-tauri/src/vault.rs: a new note never replaces a file, and
// a note's text is replaced only while it still holds `expected`. Covers are saved separately below.
export const createNote = (path: string, text: string) => invoke<void>('create_note', { path, text });
export interface NoteEdit { path: string; expected: string; text: string }
/** Renames the file and conditionally updates its incoming links, rolling back on a conflict. */
export const renameNote = (path: string, destination: string, expected: string, edits: NoteEdit[]) => invoke<void>('rename_note', { path, destination, expected, edits });
export const revealNote = (path: string) => invoke<void>('reveal_note', { path });
export const trashNote = (path: string, expected: string) => invoke<string>('trash_note', { path, expected });
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
export const getRewardSettings = (root: string) => invoke<unknown>('reward_settings', { root });
export const saveRewardSettings = (root: string, expectedRevision: number, value: unknown) => invoke<number>('save_reward_settings', { root, expectedRevision, value });

// Spike's provider boundary. Credentials are stored by the backend in macOS Keychain.
export const assistantConnection = (provider: 'openai' | 'codex' = 'openai') => invoke<{ configured: boolean }>('assistant_connection', { provider });
export const assistantReadNote = (root: string, path: string) => invoke<string>('assistant_read_note', { root, path });
export const assistantApplyNote = (action: { id: string; root: string; path: string; before: string | null; after: string }) => invoke<string>('assistant_apply_note', { action });
export const assistantAbandonAction = (root: string, id: string) => invoke<void>('assistant_abandon_action', { root, id });
export const assistantApplyCalendar = (action: { id: string; root: string; calendar: string; title: string; start: number; end: number; notes?: string }) => invoke<string>('assistant_apply_calendar', { action });
export const assistantHasMessage = (root: string, id: string) => invoke<boolean>('assistant_has_message', { root, id });
export const assistantListChats = (root: string) => invoke<unknown>('assistant_list_chats', { root });
export const assistantSearchChats = (root: string, query: string, excludeMessage?: string) => invoke<unknown>('assistant_search_chats', { root, query, excludeMessage });
export const assistantExportChat = (name: string, text: string) => invoke<string | null>('assistant_export_chat', { name, text });
export const assistantLoadChat = (root: string, id: string) => invoke<unknown>('assistant_load_chat', { root, id });
export const assistantSaveChat = (root: string, id: string, state: unknown, expectedRevision: number) => invoke<number>('assistant_save_chat', { root, id, state, expectedRevision });
export const setAssistantKey = (key: string | null) => invoke<{ configured: boolean }>('assistant_set_key', { key });
async function assistantRequest<T>(command: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const requestId = crypto.randomUUID();
  const cancel = () => { void invoke('assistant_cancel', { requestId }).catch(() => undefined); };
  signal?.addEventListener('abort', cancel, { once: true });
  try { const result = await invoke<T>(command, { ...args, requestId }); signal?.throwIfAborted(); return result; }
  finally { signal?.removeEventListener('abort', cancel); }
}
export const assistantRespond = (request: { provider?: 'openai' | 'codex'; model: string; effort?: 'default' | 'low' | 'medium' | 'high' | 'xhigh'; instructions: string; input: Record<string, unknown>[]; tools: Record<string, unknown>[] }, signal?: AbortSignal) => assistantRequest<unknown>('assistant_respond', { request }, signal);
export const assistantTranscribe = (audio: Uint8Array, mime: string, signal?: AbortSignal, provider: 'openai' | 'codex' = 'openai', voice?: VoiceSettings) => assistantRequest<string>('assistant_transcribe', { request: { audio: Array.from(audio), mime, provider, ...(voice ? { voice } : {}) } }, signal);
export const voiceConnection = (provider: VoiceProvider) => invoke<{ configured: boolean }>('voice_connection', { provider });
export const setVoiceKey = (provider: VoiceProvider, key: string | null) => invoke<void>('voice_set_key', { provider, key });
export const assistantSpeak = (text: string, signal?: AbortSignal, provider: 'openai' | 'codex' = 'openai') => assistantRequest<ArrayBuffer>('assistant_speak', { text, provider }, signal);
export const assistantOpenUrl = (url: string) => invoke<void>('assistant_open_url', { url });
export interface QuickCapture { id: string; text: string; error: string | null }
export interface QuickDocument { revision: number; draft: string; pending: QuickCapture | null }
export interface QuickStatus { glass?: boolean; connected: boolean; busy: boolean; review: boolean; label: string; reply: string; voice: VoiceSettings }
export interface QuickSnapshot { shortcuts: { typing: boolean; dictation: boolean }; root: string; visible: boolean; opened: number; dictate: boolean; status: QuickStatus; document: QuickDocument }
export const enableQuickPrompt = (root: string, enabled: boolean) => invoke<void>('prompt_enable', { root, enabled });
export const publishQuickPrompt = (root: string, status: QuickStatus) => invoke<void>('prompt_publish', { root, status });
export const quickPromptState = () => invoke<QuickSnapshot>('prompt_state');
export const onQuickPrompt = (handler: (snapshot: QuickSnapshot) => void, target: 'main' | 'spike-prompt' = 'spike-prompt') => listen<QuickSnapshot>('epizen://prompt-state', (event) => handler(event.payload), { target });
export const onQuickCommand = (handler: (command: string) => void, target: 'main' | 'spike-prompt' = 'spike-prompt') => listen<string>('epizen://prompt-command', (event) => handler(event.payload), { target });
export const saveQuickDraft = (root: string, revision: number, draft: string) => invoke<QuickDocument>('prompt_save', { root, revision, draft });
export const submitQuickPrompt = (root: string, revision: number, id: string) => invoke<void>('prompt_submit', { root, revision, id });
export const finishQuickPrompt = (root: string, id: string, error: string | null = null) => invoke<void>('prompt_finish', { root, id, error });
export const openQuickPrompt = (dictate = false) => invoke<void>('prompt_open', { dictate });
export const flushQuickPrompt = () => invoke<void>('prompt_flush');
export const quickPromptFlushed = (error: string | null = null) => invoke<void>('prompt_flushed', { error });
export const consumeQuickOpen = (opened: number) => invoke<void>('prompt_consumed', { opened });
export const hideQuickPrompt = (opened: number) => invoke<void>('prompt_hide', { opened });
export const openQuickConversation = () => invoke<void>('prompt_open_main');
export const transcribeQuickPrompt = (root: string, audio: Uint8Array, mime: string, signal?: AbortSignal, _provider?: 'codex' | 'openai', voice?: VoiceSettings) => assistantRequest<string>('assistant_transcribe', { request: { root, audio: Array.from(audio), mime, voice } }, signal);

export interface PetStatus { animation: string; label: string; motion: boolean }
export const enablePet = (root: string, enabled: boolean) => invoke<void>('pet_enable', { root, enabled });
export const publishPet = (root: string, state: PetStatus) => invoke<void>('pet_publish', { root, state });
export const petState = () => invoke<PetStatus>('pet_state');
export const onPetState = (handler: (state: PetStatus) => void) => listen<PetStatus>('epizen://pet-state', (event) => handler(event.payload));
export const onPetCommand = (handler: (command: unknown) => void) => listen<unknown>('epizen://pet-command', (event) => handler(event.payload));
export const onMainHidden = (handler: () => void) => listen('epizen://main-hidden', handler);
export interface PetPosition { x: number; y: number; scale: number }
export const petPosition = () => invoke<PetPosition>('pet_position');
export const movePet = (x: number, y: number) => invoke<void>('pet_move', { x, y });
export const openPetConversation = () => invoke<void>('pet_open_main');
export const hidePet = () => invoke<void>('pet_hide');
export const setPetMotion = (motion: boolean) => invoke<void>('pet_motion', { motion });

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
export const enableTray = (enabled: boolean) => invoke<void>('tray_enable', { enabled });
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
export type MenuItemId = 'new-tab' | 'close-tab' | 'left-sidebar' | 'right-sidebar' | 'spike-sidebar' | 'collapse-folders' | 'new-note' | 'settings' | 'home' | 'library' | 'today';

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

export const onPetWake = (handler: () => void) => listen('epizen://pet-wake', handler);

export const resizeQuickPrompt = (height: number) => invoke<void>('prompt_resize', { height });

export const applyAppearance = (glass: boolean) => invoke<void>('apply_appearance', { glass });
