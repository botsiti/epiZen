import { collectHabits, withHabits, habitActive, habitHistory, habitStats } from './lib/habits';
import { HabitsPage } from './components/habits/HabitsPage';
import { useHabitActions } from './components/habits/useHabitActions';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar } from './components/Calendar';
import { CalendarView } from './components/calendar/CalendarView';
import { chime } from './components/calendar/chime';
import { TimerPill } from './components/calendar/Timer';
import type { FocusHow } from './components/calendar/FocusMenu';
import type { TaskChange, TaskChoice } from './components/calendar/types';
import { deletePlans, renamePlans } from './components/calendar/usePlans';
import { reason, useNoteWriter } from './components/calendar/useNoteWriter';
import { useTimer, type TimerDeps } from './components/calendar/useTimer';
import { GraphView } from './components/GraphView';
import { NewNote } from './components/NewNote';
import { NoteView } from './components/NoteView';
import { BaseDocument } from './components/bases/BaseDocument';
import { AttachmentView } from './components/bases/AttachmentView';
import { NewBase } from './components/bases/NewBase';
import { BasesProvider } from './components/bases/context';
import { savedPluginDisplays } from './lib/pluginDisplay';
import { PluginDisplayProvider, PluginSurface } from './components/workspace/PluginDisplay';
import { PLUGINS, pluginSettings, effectivePlugins, pluginPreferencesPatch, savedHomeSections, requiredPlugin, savedCheckIns } from './lib/plugins';
import { MarkdownHome, PluginUnavailable } from './components/workspace/MarkdownHome';
import { Home } from './components/home/Home';
import { QuestPage, StatisticsPage } from './components/insights/Insights';
import { Summaries } from './components/home/Summaries';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LibraryView } from './components/library/LibraryView';
import { useLibraryFilters } from './components/library/useLibraryFilters';
import type { PeriodicSpec } from './components/periodic/types';
import { MissingNote, NoVault, Problem, Unsaved } from './components/Screens';
import { VaultSetup } from './components/workspace/VaultSetup';
import { createStarterVault, starterNotes, vaultPreferences, vaultPreferencesPatch } from './lib/vaultSetup';
import { librarySources } from './lib/librarySources';
import { creationFolder } from './lib/filePreferences';
import { SettingsScreen, type SettingsDraft } from './components/SettingsScreen';
import { Sidebar } from './components/Sidebar';
import { NoteActionDialog, NoteMenu, type NoteAction } from './components/workspace/NoteActions';
import { useTrayBridge } from './components/tray/useTrayBridge';
import { RightSidebar } from './components/workspace/RightSidebar';
import { AssistantConfiguration } from './components/assistant/AssistantConfiguration';
import { AssistantWorkspace } from './components/assistant/AssistantWorkspace';
import { vaultAssistantSettings, assistantPreferencesPatch } from './lib/assistant/types';
import { TabBar } from './components/workspace/TabBar';
import { useLocalGraph } from './components/workspace/useLocalGraph';
import { useScrollMemory } from './components/workspace/useScrollMemory';
import { useShortcuts } from './components/workspace/useShortcuts';
import { useExplorer } from './components/workspace/useExplorer';
import { useWorkspace } from './components/workspace/useWorkspace';
import {
  closeNow,
  createNote,
  createFolder,
  listFolders,
  trashNote,
  renameNote,
  revealNote,
  getSettings,
  guardClose,
  listFiles,
  pickVault,
  readAllNotes,
  readNote,
  writeNote,
  updateSettings,
  vaultStatus,
  type Settings,
  type VaultFile,
  type VaultStatus,
} from './lib/api';
import type { LinkTarget } from './lib/completion';
import { METRICS } from './lib/categories';
import { addDays, addMonths, parseDate, startOfMonth, today } from './lib/dates';
import { parseDay, type Day } from './lib/day';
import { addTask } from './lib/edits';
import { planText } from './lib/plans';
import { addBlock, addTaskWithBlock, findTask, focusIdOf, hasTask, newTaskLabel } from './lib/timeblocks';
import { dayKey, dayOfKey, type PendingBlock } from './lib/timer';
import { buildGraph } from './lib/graph';
import { parseBirthDate } from './lib/home';
import { buildLinkIndex } from './lib/linkIndex';
import { renameLinkEdits } from './lib/rename';
import { collectLibrary, DEFAULT_FILTERS, genreCounts, hiddenColumns, isLibraryLayout, kindOfPath, type LibraryLayout, type LibraryTab, type ListColumn } from './lib/library';
import type { LibraryFilters } from './lib/library';
import { collectMedia } from './lib/media';
import { podcastSettings } from './lib/podcasts';
import { noteFolder, noteTitle, resolveLink } from './lib/links';
import {
  builtInPeriodicText,
  assertPeriodicNote,
  periodicFeatures,
  periodicCatalog,
  periodicSettings,
  rememberPeriodic,
  type PeriodicRecognition,
  periodicPath,
  periodKey,
  periodOfName,
  type Period,
  type PeriodicSettings,
} from './lib/periodic';
import { artPaths, changeQuest, parseQuests, setQuestProgress, toggleQuest, type Quest, type QuestChange, type QuestEntry } from './lib/quests';
import { metricScale, type DayEntry } from './lib/rollup';
import { flushAll, whenSaved } from './lib/saving';
import {
  activate,
  activeTab,
  back as goBack,
  close as closeTab,
  closeActive,
  currentView,
  cycle,
  forward as goForward,
  HOME,
  notePath,
  open,
  openTab,
  parseRightSidebar,
  replaceView,
  renameNoteViews,
  setPinned,
  showIn,
  type PanelId,
  type RightSidebar as RightSidebarState,
  type View,
} from './lib/tabs';
import { useToday } from './lib/useToday';
import { panelView } from './lib/tray';
import { buildTree, countFolders } from './lib/tree';

// Each daily note parsed once per text it has had: saves and new notes bring new text.
const parsedDays = new Map<string, { text: string; day: Day }>();
function dayFrom(path: string, text: string): Day {
  const cached = parsedDays.get(path);
  if (cached?.text === text) return cached.day;
  const day = parseDay(text);
  parsedDays.set(path, { text, day });
  return day;
}

export function App() {
  const [setup, setSetup] = useState<'existing' | 'create'>();
  const [status, setStatus] = useState<VaultStatus>();
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  // The open tabs, each with its own history (src/lib/tabs.ts); the main pane shows the one in front.
  const { ws, update, restore, reset } = useWorkspace();
  const [right, setRight] = useState<RightSidebarState>({ open: false, closed: [] });
  const [assistantRequested, setAssistantOpen] = useState(false);
  const [assistantCbt, setAssistantCbt] = useState<{ path: string; token: number }>();
  const [leftOpen, setLeftOpen] = useState(true);
  const [loads, setLoads] = useState(0);
  const [folderError, setFolderError] = useState<string>();
  const [settings, setSettings] = useState<Settings>({});
  const timerBusy = useRef(false);
  // Every note's text, for links, backlinks and the graph. Saves and new notes keep it current.
  const [texts, setTexts] = useState<ReadonlyMap<string, string>>(new Map());
  const [month, setMonth] = useState(() => startOfMonth(today()));
  const tab = activeTab(ws);
  const view = currentView(tab);
  const main = useRef<HTMLElement>(null);
  const now = useToday();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await vaultStatus();
      const found = next.state === 'open' ? await listFiles() : [];
      const directories = next.state === 'open' ? await listFolders() : [];
      const read = next.state === 'open' ? await readAllNotes() : [];
      let stored = await getSettings();
      if (next.state === 'open' && stored.periodic && !stored.legacyPeriodicVault && periodicCatalog(found, periodicSettings(stored)).byPath.size > 0) {
        stored = await updateSettings({ legacyPeriodicVault: next.root });
      }
      if (cancelled) return;
      setFiles(found);
      setFolders(directories);
      setTexts(new Map(read.map((note) => [note.path, note.text])));
      setSettings(stored);
      // The tabs and the right sidebar as they were left in this vault, never a note that is gone.
      if (next.state === 'open') restore(stored.workspace, { vault: next.root, notes: new Set(found.filter((file) => file.kind === 'note' || file.kind === 'base').map((file) => file.path)) });
      setRight(parseRightSidebar(stored.rightSidebar));
      setLeftOpen(stored.leftSidebarOpen !== false);
      setSetup((previous) => previous === 'create' ? 'create' : undefined);
      setStatus(next);
    };
    load().catch((err: unknown) => {
      if (!cancelled) setStatus({ state: 'error', message: String(err) });
    });
    return () => {
      cancelled = true;
    };
  }, [loads, restore]);

  // A new screen starts at the top; switching a note between reading and editing doesn't. Each
  // tab comes back to where it was scrolled.
  const place = view.kind === 'note' ? view.path : view.kind;
  const onScroll = useScrollMemory(main, tab.id, place);

  // A close or quit first saves what the editor holds. If a note can't be saved, the window stays
  // open with the editor's warning and its text. Closing again closes only when it is still those
  // same notes; any other failure holds the window again. A request while a flush runs waits for it.
  useEffect(() => {
    let flushing = false;
    let warned: string | undefined;
    const stop = guardClose(() => {
      if (flushing) return;
      flushing = true;
      void flushAll().then((unsaved) => {
        flushing = false;
        const notes = unsaved.join('\n');
        if (!unsaved.length || notes === warned) void closeNow();
        else warned = notes;
      });
    });
    return () => void stop.then((unlisten) => unlisten());
  }, []);

  const tree = useMemo(() => buildTree(files, folders), [files, folders]);
  const notes = useMemo(() => files.filter((file) => file.kind === 'note').map((file) => file.path.replace(/\.md$/i, '')), [files]);
  const preferences = useMemo(() => vaultPreferences(settings, status?.state === 'open' ? status.root : ''), [settings, status]);
  const persistLibraryFilters = useCallback((filters: LibraryFilters) => updateSettings({ libraryFilters: filters }).then(() => undefined), []);
  const savedLibraryFilters = useLibraryFilters(settings.libraryFilters, status?.state === 'open', preferences.complete, persistLibraryFilters);
  const periodic = preferences.periodic;
  const recognition = preferences.recognition;
  const pluginDisplay = useMemo(() => savedPluginDisplays(settings, status?.state === 'open' ? status.root : ''), [settings, status]);
  const configuredPlugins = useMemo(() => pluginSettings(settings, status?.state === 'open' ? status.root : ''), [settings, status]);
  const plugins = useMemo(() => effectivePlugins(configuredPlugins), [configuredPlugins]);
  const assistantOpen = plugins.spike && assistantRequested;
  const assistantSettings = useMemo(() => vaultAssistantSettings(settings, status?.state === 'open' ? status.root : ''), [settings, status]);
  const saveAssistantSettings = useCallback(async (assistant: typeof assistantSettings) => {
    if (status?.state !== 'open') throw new Error('No vault is open.');
    setSettings(await updateSettings(assistantPreferencesPatch(await getSettings(), status.root, assistant)));
  }, [status]);
  const homeSections = useMemo(() => savedHomeSections(settings, status?.state === 'open' ? status.root : ''), [settings, status]);
  const features = useMemo(() => ({ ...periodicFeatures(settings.periodicFeatures), habits: plugins.habits, thoughtRecords: plugins.cbt, quests: plugins.quests, timer: plugins.timer, statistics: plugins.statistics, checkIns: { ...savedCheckIns(settings, status?.state === 'open' ? status.root : ''), enabled: plugins.checkins } }), [settings, status, plugins]);
  const sources = useMemo(() => librarySources(settings.librarySources), [settings.librarySources]);
  const podcasts = useMemo(() => podcastSettings(settings.podcasts), [settings.podcasts]);
  const catalog = useMemo(() => periodicCatalog(plugins.periodic ? files : [], periodic, plugins.periodic ? texts : new Map(), recognition), [files, periodic, texts, recognition, plugins.periodic]);
  const assistantCatalog = useMemo(() => plugins.periodic || !plugins.spike ? catalog : periodicCatalog(files, periodic, texts, recognition), [plugins.periodic, plugins.spike, catalog, files, periodic, texts, recognition]);
  const periodicNotes = catalog.index;
  // Opens a screen in the tab in front, or in a new tab (⌘-click, or when the tab in front is pinned).
  const go = useCallback((next: View, newTab?: boolean) => update((prev) => open(prev, next, { newTab })), [update]);
  const links = useMemo(() => buildLinkIndex([...texts].map(([path, text]) => ({ path, text })), files), [texts, files]);
  const graph = useMemo(
    () => buildGraph(plugins.graph ? files.filter((file) => file.kind === 'note').map((file) => file.path) : [], links.outgoing),
    [files, links, plugins.graph],
  );
  const openNote = useCallback((path: string, newTab?: boolean) => go({ kind: 'note', path }, newTab), [go]);
  const shelves = useMemo(() => collectMedia(plugins.library ? [...texts].map(([path, text]) => ({ path, text })) : [], files), [texts, files, plugins.library]);
  const library = useMemo(() => collectLibrary(plugins.library ? [...texts].map(([path, text]) => ({ path, text })) : [], files), [texts, files, plugins.library]);
  const openLibrary = useCallback((tab: LibraryTab, newTab?: boolean) => go({ kind: 'library', tab }, newTab), [go]);
  // The library remembers its tab in its place in its tab's history, so coming back finds it again.
  const setLibraryTab = useCallback(
    (id: number, tab: LibraryTab) => update((prev) => replaceView(prev, (v) => (v.kind === 'library' ? { ...v, tab } : v), id)),
    [update],
  );
  // Covers or the list, kept in the app's settings (never the vault), for every library tab.
  const libraryLayout: LibraryLayout = isLibraryLayout(settings.libraryLayout) ? settings.libraryLayout : 'covers';
  const setLibraryLayout = useCallback((layout: LibraryLayout) => {
    setSettings((prev) => ({ ...prev, libraryLayout: layout }));
    void updateSettings({ libraryLayout: layout }).catch(() => undefined);
  }, []);
  // And the list's columns hidden from its Properties.
  const libraryHidden = useMemo(() => hiddenColumns(settings.libraryHidden), [settings]);
  const setLibraryHidden = useCallback((hidden: ListColumn[]) => {
    setSettings((prev) => ({ ...prev, libraryHidden: hidden }));
    void updateSettings({ libraryHidden: hidden }).catch(() => undefined);
  }, []);
  const todayNote = useMemo(
    () => ({ date: now, path: periodicNotes.get(periodKey('day', now)), name: noteTitle(periodicPath('day', now, periodic)) }),
    [now, periodic, periodicNotes],
  );
  const habitCatalog = useMemo(() => collectHabits(plugins.habits ? texts : new Map()), [texts, plugins.habits]);
  // Everything a daily, weekly or monthly note's page reads from the rest of the vault.
  const dayOf = useCallback(
    (date: Date): DayEntry => {
      const path = periodicNotes.get(periodKey('day', date));
      const text = path === undefined ? undefined : texts.get(path);
      const recorded = path === undefined || text === undefined ? undefined : dayFrom(path, text);
      const scheduled = date <= now && habitCatalog.habits.some((h) => habitActive(h, date));
      return { date, path, scheduledOnly: !recorded && scheduled, day: recorded || scheduled ? withHabits(recorded ?? parseDay(''), habitCatalog.habits, date, now) : undefined };
    },
    [periodicNotes, texts, habitCatalog.habits, now],
  );
  // Every daily note, for the homepage's life XP, streak and spheres.
  const dailyNotes = useMemo(
    () =>
      [...periodicNotes.keys()].flatMap((key) => {
        const date = key.startsWith('day:') ? parseDate(key.slice('day:'.length), 'YYYY-MM-DD') : undefined;
        return date ? [dayOf(date)] : [];
      }),
    [periodicNotes, dayOf],
  );
  const recordedHabitDays = useMemo(() => [...periodicNotes].flatMap(([key, path]) => {
    const date = key.startsWith('day:') ? parseDate(key.slice(4), 'YYYY-MM-DD') : undefined;
    const text = texts.get(path);
    return date && text !== undefined ? [{ date, path, day: dayFrom(path, text) }] : [];
  }), [periodicNotes, texts]);
  const habitSummaries = useMemo(() => Object.fromEntries(habitCatalog.habits.map((h) => [h.id, habitStats(habitHistory(h, recordedHabitDays, now), now)])), [habitCatalog.habits, recordedHabitDays, now]);
  const birthDate = useMemo(() => parseBirthDate(settings.birthDate), [settings]);
  const dailyFacts = useMemo(() => {
    const values = new Map<string, number[]>();
    const categories = new Map<string, number>();
    for (const [key, path] of periodicNotes) {
      const text = key.startsWith('day:') ? texts.get(path) : undefined;
      if (text === undefined) continue;
      const day = dayFrom(path, text);
      for (const [name, value] of Object.entries(day.numbers)) values.set(name, [...(values.get(name) ?? []), value]);
      for (const task of day.tasks) if (task.category) categories.set(task.category.name, (categories.get(task.category.name) ?? 0) + 1);
    }
    const scales: Record<string, number> = {};
    for (const key of ['done', 'sleep', ...METRICS.map((metric) => metric.key)]) scales[key] = metricScale(key, values.get(key) ?? []);
    return { scales, categories: [...categories].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name) };
  }, [periodicNotes, texts]);
  const mediaByTitle = useMemo(() => new Map(shelves.flatMap((shelf) => shelf.items.map((item) => [item.title, item] as const))), [shelves]);
  const weekOf = useCallback(
    (monday: Date) => {
      const path = periodicNotes.get(periodKey('week', monday));
      return { path, text: path === undefined ? undefined : texts.get(path) };
    },
    [periodicNotes, texts],
  );
  const exists = useCallback((period: Period, date: Date) => periodicNotes.has(periodKey(period, date)), [periodicNotes]);
  const monthOf = useCallback((date: Date) => {
    const key = periodKey('month', date);
    const path = periodicNotes.get(key);
    return { path, text: path ? texts.get(path) : undefined, ambiguous: !path && catalog.matches.has(key) };
  }, [periodicNotes, texts, catalog]);
  // Weekly quests from weekly notes, monthly ones from monthly notes, mythic ones from Custom Quests.md.
  const quests = useMemo(() => {
    const list: QuestEntry[] = [];
    if (!plugins.quests) return list;
    for (const [key, path] of periodicNotes) {
      const [period, iso = ''] = key.split(':');
      const text = period === 'day' ? undefined : texts.get(path);
      const from = parseDate(iso, 'YYYY-MM-DD');
      if (text === undefined || !from) continue;
      const to = period === 'week' ? addDays(from, 7) : addMonths(from, 1);
      for (const quest of parseQuests(path, text)) if (quest.scope !== 'custom') list.push({ quest, period: { from, to } });
    }
    for (const file of files) {
      if (file.kind !== 'note' || noteTitle(file.path) !== 'Custom Quests') continue;
      for (const quest of parseQuests(file.path, texts.get(file.path) ?? '')) list.push({ quest });
    }
    return list;
  }, [periodicNotes, texts, files, plugins.quests]);
  const images = useMemo(() => new Set(files.filter((file) => file.kind === 'image').map((file) => file.path)), [files]);
  const art = useCallback((quest: Quest) => artPaths(quest).find((path) => images.has(path)), [images]);
  const periodicPage = useMemo((): PeriodicSpec | undefined => {
    const found = view.kind === 'note' ? catalog.byPath.get(view.path) : undefined;
    if (!found) return undefined;
    const categories = dailyFacts.categories.length ? dailyFacts.categories : ['code', 'study', 'sport', 'business', 'book', 'kaizen'];
    return { period: found.period, date: found.date, dayOf, weekOf, exists, scales: dailyFacts.scales, media: mediaByTitle, categories, quests, art, features, habits: habitCatalog.habits, habitStats: habitSummaries };
  }, [view, catalog, dayOf, weekOf, exists, dailyFacts, mediaByTitle, quests, art, features, habitCatalog.habits, habitSummaries]);
  const linkTargets = useMemo(() => {
    const titles = new Map<string, number>();
    for (const path of notes) titles.set(noteTitle(path), (titles.get(noteTitle(path)) ?? 0) + 1);
    const targets: LinkTarget[] = notes.map((path) => ({
      label: noteTitle(path),
      detail: noteFolder(path) || undefined,
      // Two notes with one name: link by path, as Obsidian does.
      insert: (titles.get(noteTitle(path)) ?? 0) > 1 ? path : undefined,
    }));
    // Daily notes that don't exist yet can be linked too; following the link creates them.
    for (const [offset, detail] of [[0, 'today'], [-1, 'yesterday'], [1, 'tomorrow']] as const) {
      const path = periodicPath('day', addDays(now, offset), periodic).replace(/\.md$/i, '');
      if (!titles.has(noteTitle(path))) targets.push({ label: noteTitle(path), detail });
    }
    return targets;
  }, [notes, periodic, now]);
  // Reads the vault's files and texts again after the app created a note.
  const refresh = useCallback(async () => {
    if (status?.state !== 'open') return;
    const [found, read, directories] = await Promise.all([listFiles(), readAllNotes(), listFolders()]);
    const current = await vaultStatus();
    if (current.state !== 'open' || current.root !== status.root) return;
    setFolders(directories);
    setFiles(found);
    setTexts(new Map(read.map((note) => [note.path, note.text])));
  }, [status]);
  const deleteLibraryNote = useCallback(async (path: string) => {
    if (!kindOfPath(path)) throw new Error('Only library notes can be deleted here.');
    const unsaved = await flushAll();
    if (unsaved.length) throw new Error('Save or recover the unsaved notes before deleting.');
    const expected = await readNote(path);
    const destination = await trashNote(path, expected);
    update((previous) => previous.tabs.filter((tab) => notePath(currentView(tab)) === path).reduce((next, tab) => closeTab(next, tab.id), previous));
    setFiles((previous) => previous.filter((file) => file.path !== path));
    setTexts((previous) => { const next = new Map(previous); next.delete(path); return next; });
    return destination;
  }, [update]);
  // A library note opens as its media page; finding it a cover reads the vault again, for the note and its new image.
  const mediaPage = useMemo(() => {
    const spec = plugins.library && view.kind === 'note' ? kindOfPath(view.path) : undefined;
    return spec && { spec, onOpenLibrary: () => openLibrary(spec.kind), onCoverSaved: refresh };
  }, [view, openLibrary, refresh, plugins.library]);
  const noteSaved = useCallback((path: string, text: string) => {
    setTexts((prev) => new Map(prev).set(path, text));
    setFiles((prev) => prev.map((file) => file.path === path ? { ...file, modified: Date.now(), size: new TextEncoder().encode(text).length } : file));
  }, []);
  // Changes to a note other than the open one (a quest in its weekly note or Custom Quests.md): one
  // at a time, each over the note as it is on disk now, and written only while it still holds that.
  const edits = useRef(Promise.resolve());
  const [editError, setEditError] = useState<string>();
  // Each settles with why it wasn't written, if it wasn't.
  const editNote = useCallback(
    (path: string, edit: (text: string) => string, failed: string): Promise<string | undefined> => {
      const job = edits.current.then(async () => {
        try {
          const current = await readNote(path);
          const next = edit(current);
          if (next === current) return undefined;
          await writeNote(path, next, current);
          noteSaved(path, next);
          setEditError(undefined);
          return undefined;
        } catch (err) {
          const problem = err instanceof Error ? err.message : String(err);
          setEditError(`${failed}: ${problem}`);
          const fresh = await readNote(path).catch(() => undefined);
          if (fresh !== undefined) noteSaved(path, fresh);
          return problem;
        }
      });
      edits.current = job.then(() => undefined);
      return job;
    },
    [noteSaved],
  );
  const onQuestToggle = useCallback((quest: Quest) => void editNote(quest.path, (text) => toggleQuest(text, quest, new Date()), 'The quest wasn\'t changed'), [editNote]);
  const onQuestProgress = useCallback(
    (quest: Quest, value: number) => void editNote(quest.path, (text) => setQuestProgress(text, quest, value, new Date()), 'The quest wasn\'t changed'),
    [editNote],
  );
  // A chapter or a deadline from a quest's detail, in the quest's own note.
  const onQuestChange = useCallback(
    (quest: Quest, change: QuestChange) => editNote(quest.path, (text) => changeQuest(text, quest, change, new Date()), 'The quest wasn\'t changed'),
    [editNote],
  );
  const back = tab.index > 0 ? () => update((prev) => goBack(prev)) : undefined;
  // Reading or editing, in the note's own tab: an editor that closes after the tab went to the back still closes there.
  const setEditing = useCallback(
    (id: number, editing: boolean) => update((prev) => replaceView(prev, (v) => (v.kind === 'note' ? { ...v, editing } : v), id)),
    [update],
  );
  // Text an editor couldn't save goes to its own tab, brought to the front, or to a new tab if that one was closed.
  const showUnsaved = useCallback(
    (id: number, path: string, text: string, message: string) => update((prev) => showIn(prev, id, { kind: 'unsaved', path, text, message })),
    [update],
  );
  const toggleRight = useCallback(() => {
    setAssistantOpen(false);
    const next = { ...right, open: !right.open };
    setRight(next);
    void updateSettings({ rightSidebar: next }).catch(() => undefined);
  }, [right]);
  const togglePanel = useCallback(
    (panel: PanelId) => {
      const closed = right.closed.includes(panel) ? right.closed.filter((p) => p !== panel) : [...right.closed, panel];
      const next = { ...right, closed };
      setRight(next);
      void updateSettings({ rightSidebar: next }).catch(() => undefined);
    },
    [right],
  );
  const newTab = useCallback(() => update((prev) => openTab(prev, HOME)), [update]);
  const explorer = useExplorer(tree, view.kind === 'note' ? view.path : undefined);
  const resetExplorer = explorer.reset;
  const toggleLeft = () => {
    setLeftOpen(!leftOpen);
    void updateSettings({ leftSidebarOpen: !leftOpen }).catch(() => undefined);
  };
  const newNote = () => go({ kind: 'new', folder: creationFolder(preferences.fileDefaults, 'note', view.kind === 'note' ? view.path : undefined) });
  const newFolder = () => go({ kind: 'new', item: 'folder', folder: creationFolder(preferences.fileDefaults, 'folder', view.kind === 'note' ? view.path : undefined) });

  const chooseFolder = useCallback(async (create = false) => {
    setFolderError(undefined);
    try {
      if ((await flushAll()).length) throw new Error('Save or recover your unsaved notes before switching vaults.');
      if (!(await pickVault())) return;
      setSetup(create ? 'create' : undefined);
      setStatus(undefined);
      reset();
      resetExplorer();
      setLoads((n) => n + 1);
    } catch (err) {
      // The vault that was open stays open.
      setFolderError(String(err));
    }
  }, [reset, resetExplorer]);

  // Add in the library created a note (and maybe its cover): read the vault again, then open it.
  const mediaCreated = useCallback(
    async (path: string) => {
      await refresh().catch(() => undefined);
      go({ kind: 'note', path });
    },
    [go, refresh],
  );

  const create = useCallback(
    async (path: string) => {
      await createNote(path, '');
      go({ kind: 'note', path, editing: true });
      // The note exists now; reading the vault again only updates the sidebar and links.
      refresh().catch(() => undefined);
    },
    [go, refresh],
  );

  // A day, week or month's note: the one it has, or one created with built-in starting text.
  // The calendar and the timer use this too, without opening the note.
  const ensurePeriodic = useCallback(
    async (period: Period, date: Date): Promise<string> => {
      if (!plugins.periodic) throw new Error('Enable Periodic notes in Settings → Plugins first.');
      const existing = periodicNotes.get(periodKey(period, date));
      if (existing) return existing;
      if (catalog.matches.has(periodKey(period, date))) throw new Error('More than one note has this date. Choose its calendar note in Settings → Existing notes.');
      const path = periodicPath(period, date, periodic);
      try {
        await createNote(path, builtInPeriodicText(period, date));
      } catch (err) {
        // A concurrent creation is safe to reuse only if it is this period's note.
        if (!String(err).includes('already exists')) throw err;
        assertPeriodicNote(path, await readNote(path), period, date, periodic, recognition);
      }
      await refresh();
      return path;
    },
    [periodic, periodicNotes, catalog, recognition, refresh, plugins.periodic],
  );
  // A day, week or month opens its note, creating it first if it has none.
  const openPeriodic = useCallback(
    async (period: Period, date: Date, newTab?: boolean) => {
      if (!periodicNotes.has(periodKey(period, date)) && catalog.matches.has(periodKey(period, date))) { go({ kind: 'settings', section: 'periodic' }, newTab); return; }
      go({ kind: 'note', path: await ensurePeriodic(period, date) }, newTab);
    },
    [ensurePeriodic, go, periodicNotes, catalog],
  );
  const openPeriodicOrSay = useCallback(
    (period: Period, date: Date, newTab?: boolean) =>
      void openPeriodic(period, date, newTab).catch((err: unknown) =>
        go({ kind: 'problem', title: "Couldn't create the note", message: String(err) }, newTab),
      ),
    [go, openPeriodic],
  );
  useShortcuts({
    newTab,
    closeTab: () => update(closeActive),
    toggleLeftSidebar: toggleLeft,
    toggleRightSidebar: toggleRight,
    toggleAssistant: () => { if (plugins.spike) setAssistantOpen((open) => !open); else go({ kind: 'settings', section: 'plugins' }); },
    collapseFolders: explorer.collapseAll,
    newNote,
    settings: () => { if (view.kind !== 'settings') go({ kind: 'settings' }); },
    home: () => go(HOME),
    library: () => openLibrary('all'),
    today: () => openPeriodicOrSay('day', today()),
    back: () => update((prev) => goBack(prev)),
    forward: () => update((prev) => goForward(prev)),
    cycle: (step) => update((prev) => cycle(prev, step)),
    showTab: (at) => update((prev) => {
      const target = prev.tabs[Math.min(at, prev.tabs.length - 1)];
      return target ? activate(prev, target.id) : prev;
    }),
  }, status?.state === 'open' && !setup);
  // A link to a missing day, week or month creates that note, like the calendar; any other
  // missing note is only explained, never created.
  const openLink = useCallback(
    (target: string, fromPath: string, newTab?: boolean) => {
      const [destination, baseView] = target.split('#');
      const file = resolveLink(destination ?? target, files, fromPath);
      const named = file || !plugins.periodic ? undefined : periodOfName(target, periodic);
      if (named) openPeriodicOrSay(named.period, named.date, newTab);
      else if (!file) go({ kind: 'missing', target }, newTab);
      else go({ kind: 'note', path: file.path, ...(file.kind === 'base' && baseView ? { baseView } : {}) }, newTab);
    },
    [files, go, periodic, openPeriodicOrSay, plugins.periodic],
  );
  // An empty birth date removes the setting rather than keeping an empty one.
  const saveSettings = useCallback(
    async (next: SettingsDraft) => {
      if (status?.state !== 'open') throw new Error('No vault is open.');
      if (next.plugins && plugins.timer && !effectivePlugins(next.plugins).timer && timerBusy.current) throw new Error('Stop the focus timer and resolve its pending saves before disabling this plugin.');
      if (plugins.spike && next.plugins?.spike === false) {
        const unsaved = await flushAll();
        if (unsaved.length) throw new Error(`Save or recover ${unsaved.join(', ')} before disabling Spike.`);
        setAssistantOpen(false);
      }
      const latest = await getSettings();
      const patch = vaultPreferencesPatch(latest, status.root, rememberPeriodic(periodic, next.periodic), next.recognition ?? recognition, next.fileDefaults);
      const pluginPatch = next.plugins ? pluginPreferencesPatch({ ...latest, ...patch }, status.root, next.plugins, next.homeSections ?? homeSections, next.features.checkIns, next.pluginDisplay) : {};
      setSettings(await updateSettings({ ...patch, ...pluginPatch, ...(!preferences.complete && settings.libraryFilters === undefined ? { libraryFilters: DEFAULT_FILTERS } : {}), librarySources: next.sources, birthDate: next.birthDate.trim() || null, podcasts: next.podcasts, periodicFeatures: next.features }));
    },
    [settings, status, periodic, recognition, homeSections, plugins.timer, plugins.spike, preferences.complete],
  );
  const finishSetup = useCallback(async (next: PeriodicSettings, reading: PeriodicRecognition, create = false) => {
    if (status?.state !== 'open') throw new Error('No vault is open.');
    if (create) await createStarterVault(starterNotes(now), await readAllNotes(), createNote);
    const patch = vaultPreferencesPatch(settings, status.root, preferences.complete ? rememberPeriodic(periodic, next) : next, reading);
    setSettings(await updateSettings({ ...patch, ...pluginPreferencesPatch({ ...settings, ...patch }, status.root, configuredPlugins, homeSections, features.checkIns), ...(!preferences.complete && settings.libraryFilters === undefined ? { libraryFilters: DEFAULT_FILTERS } : {}) }));
    await refresh();
    setSetup(undefined);
  }, [status, settings, periodic, preferences.complete, now, refresh, configuredPlugins, homeSections, features.checkIns]);

  // The calendar's and the timer's writes: one at a time, over the text the app last read.
  const changeNote = useNoteWriter(texts, noteSaved);
  const [calendarWarning, setCalendarWarning] = useState<string>();
  // Why the timer last didn't start, for the menu bar's panel, where a start may have come from.
  const [startProblem, setStartProblem] = useState<string>();
  // Which vault is open, by its folder: a timed block is only ever written into the vault it was timed in.
  const vault = status?.state === 'open' ? status.root : undefined;
  // Changes a day's note. A day without one gets built-in starting text with the change already
  // in: if the change can't be made (for example, if its Tasks heading is missing), no note is created.
  const changeDay = useCallback(
    async (date: Date, edit: (text: string) => string | undefined): Promise<{ path: string; text: string }> => {
      const existing = periodicNotes.get(periodKey('day', date));
      if (existing) return { path: existing, text: await changeNote(existing, edit) };
      if (catalog.matches.has(periodKey('day', date))) throw new Error('Choose the calendar note for this day in Settings → Existing notes before adding tasks.');
      const path = periodicPath('day', date, periodic);
      const template = builtInPeriodicText('day', date);
      const text = edit(template) ?? template;
      try {
        await createNote(path, text);
      } catch (err) {
        // Validate the text inside the conditional write, including explicit calendar exclusions.
        if (!String(err).includes('already exists')) throw err;
        await refresh();
        return { path, text: await changeNote(path, (current) => {
          assertPeriodicNote(path, current, 'day', date, periodic, recognition);
          return edit(current);
        }) };
      }
      await refresh();
      return { path, text };
    },
    [changeNote, periodic, periodicNotes, catalog, recognition, refresh],
  );
  const writeDay = useCallback(
    async (date: Date, edit: (text: string) => string, failed: string) => {
      try {
        const { path } = await changeDay(date, edit);
        setCalendarWarning(undefined);
        return path;
      } catch (err) {
        setCalendarWarning(`${failed}: ${reason(err)}. The calendar shows the note as it is now.`);
        return undefined;
      }
    },
    [changeDay],
  );
  // The note open in the editor, if one is. The timer doesn't write into it under the editor's
  // hands (the editor's next save would be refused); its blocks wait until Done.
  const editingPath = view.kind === 'note' && view.editing ? view.path : undefined;
  const editing = useRef(editingPath);
  useEffect(() => {
    editing.current = editingPath;
  }, [editingPath]);
  // A finished stretch of focus goes under its task in its day's note. A stretch that began
  // after midnight goes to that day's note, under the same task, added there if it isn't yet.
  const writeBlock = useCallback(
    async (block: PendingBlock) => {
      if (!vault) throw new Error('no vault is open');
      if (block.task.vault !== vault) throw new Error('it was timed in another vault');
      const own = block.day === block.task.day;
      const date = dayOfKey(block.day);
      const target = own ? block.task.path : (periodicNotes.get(periodKey('day', date)) ?? periodicPath('day', date, periodic));
      if (target === editing.current) throw new Error('its note is open in the editor; it goes in when you click Done');
      const edit = (text: string) =>
        own || hasTask(text, block.task)
          ? addBlock(text, findTask(text, block.task), block.start, block.end)
          : addTaskWithBlock(text, block.task.category ?? 'other', block.task.label, block.start, block.end);
      // The task's own note is never created again if it has gone.
      if (own) await changeNote(target, edit);
      else await changeDay(date, edit);
    },
    [changeDay, changeNote, periodic, periodicNotes, vault],
  );
  const timerDeps = useMemo((): TimerDeps => ({ save: (state) => updateSettings({ timer: state }), write: writeBlock, chime }), [writeBlock]);
  const timer = useTimer(timerDeps, settings.timer, status?.state === 'open', plugins.timer);
  useEffect(() => { timerBusy.current = Boolean(timer.state.session || timer.state.rest || timer.state.pending.length || timer.saveError); }, [timer.state, timer.saveError]);
  const [noteMenu, setNoteMenu] = useState<{ path: string; x: number; y: number }>();
  const [noteAction, setNoteAction] = useState<{ path: string; action: Exclude<NoteAction, 'reveal'> }>();
  const [fileActionError, setFileActionError] = useState<string>();
  const [noteVersion, setNoteVersion] = useState(0);
  const chooseNoteAction = useCallback((path: string, action: NoteAction) => {
    setNoteMenu(undefined);
    setFileActionError(undefined);
    if (action === 'reveal') void revealNote(path).catch((err: unknown) => setFileActionError(`Could not reveal the note: ${reason(err)}`));
    else setNoteAction({ path, action });
  }, []);
  const runNoteAction = useCallback(async (action: Exclude<NoteAction, 'reveal'>, path: string, name: string) => {
    const unsaved = await flushAll();
    if (unsaved.length) throw new Error('Save or recover the unsaved notes before changing files.');
    await edits.current;
    const isDaily = catalog.byPath.get(path)?.period === 'day';
    const timerOwnsNote = timer.state.session?.task.path === path || timer.state.pending.some((block) => block.task.path === path);
    if (action !== 'duplicate' && (timerOwnsNote || (isDaily && (timer.state.session || timer.state.pending.length)))) {
      throw new Error('Finish the focus timer and save its pending time before changing this note.');
    }
    const expected = await readNote(path);
    if (action === 'delete') {
      await trashNote(path, expected);
      update((previous) => previous.tabs.filter((item) => notePath(currentView(item)) === path).reduce((next, item) => closeTab(next, item.id), previous));
      setFiles((previous) => previous.filter((file) => file.path !== path));
      setTexts((previous) => { const next = new Map(previous); next.delete(path); return next; });
      return;
    }
    const base = name.replace(/\.md$/i, '').trim();
    if (!base || base.startsWith('.')) throw new Error('Give the note a valid name.');
    const folder = noteFolder(path);
    const destination = `${folder ? `${folder}/` : ''}${base}.md`;
    if (action === 'duplicate') {
      await createNote(destination, expected);
      setFiles((previous) => [...previous, { path: destination, kind: 'note' }]);
      setTexts((previous) => new Map(previous).set(destination, expected));
      go({ kind: 'note', path: destination }, true);
      return;
    }
    if (destination === path) return;
    const [snapshot, found] = await Promise.all([readAllNotes(), listFiles()]);
    const source = snapshot.find((note) => note.path === path);
    if (!source) throw new Error('The note could not be read. Nothing was renamed.');
    const linkEdits = renameLinkEdits(snapshot, found, path, destination);
    try {
      await renameNote(path, destination, source.text, linkEdits);
    } catch (err) {
      // A conflicting external edit remains authoritative, including a failed rollback.
      try { await refresh(); }
      catch (refreshError) { throw new Error(`${reason(err)}. Could not refresh the file list: ${reason(refreshError)}`, { cause: refreshError }); }
      finally { setNoteVersion((version) => version + 1); }
      throw err;
    }
    update((previous) => renameNoteViews(previous, path, destination));
    setFiles(found.map((file) => file.path === path ? { ...file, path: destination } : file));
    setTexts((previous) => {
      const next = new Map(previous);
      for (const edit of linkEdits) next.set(edit.path, edit.text);
      const renamedText = linkEdits.find((edit) => edit.path === path)?.text ?? source.text;
      next.delete(path); next.set(destination, renamedText);
      return next;
    });
    // Editors were flushed above. Reload their rewritten links before accepting new edits.
    setNoteVersion((version) => version + 1);
  }, [timer.state.session, timer.state.pending, catalog, update, go, refresh]);
  const vaultName = status?.state === 'open' ? status.name : undefined;
  // A task edited or deleted from a menu: the timer follows it, and so do its plans in Calendar.
  const taskChanged = useCallback(
    (change: TaskChange) => {
      if (change.kind === 'edited') timer.retask(change.path, change.before, change.after);
      if (!change.focusId || !vaultName) return;
      const link = { vault: vaultName, note: change.path, id: change.focusId };
      const follow = change.kind === 'edited' ? renamePlans(link, change.date, planText(change.after.category, change.after.label)) : deletePlans(link, change.date);
      follow.catch((err: unknown) => setCalendarWarning(`The task’s plans in Calendar didn’t follow it: ${reason(err)}`));
    },
    [timer, vaultName],
  );
  // The Apple Calendar last chosen for each category's plans.
  const planCalendars = useMemo(() => {
    const stored = settings.planCalendars;
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  }, [settings.planCalendars]);
  const chooseCalendar = useCallback(
    (category: string, calendar: string) => {
      if (planCalendars[category] === calendar) return;
      void updateSettings({ planCalendars: { ...planCalendars, [category]: calendar } }).then(setSettings);
    },
    [planCalendars],
  );
  // Done in the editor, or its tab gone to the back (maybe for another tab's editor) or closed: the
  // blocks that waited for it go in now, once the editor's last save has landed.
  const wasEditing = useRef(editingPath);
  useEffect(() => {
    if (wasEditing.current !== undefined && editingPath !== wasEditing.current) void whenSaved().then(() => timer.retryAll());
    wasEditing.current = editingPath;
  }, [editingPath, timer]);
  // The timer starts on one of today's tasks, or on a new one added to today's note first:
  // as the timer card is set, or as a right-click asked (a stopwatch, or a pomodoro round).
  const startTimer = useCallback(
    async (choice: TaskChoice, how?: FocusHow) => {
      if (!vault || !plugins.timer) return;
      const date = today();
      try {
        const want =
          choice.kind === 'task'
            ? { label: choice.label, category: choice.category, line: choice.ref.line, focusId: focusIdOf(choice.ref.text) }
            : { label: newTaskLabel(choice.words), category: choice.category };
        const { path, text } = await changeDay(date, (t) => (choice.kind === 'new' && !hasTask(t, want) ? addTask(t, choice.category, choice.words, 0) : undefined));
        const found = findTask(text, want);
        const task = { path, day: dayKey(date), line: found.line, label: want.label, category: want.category, focusId: focusIdOf(found.text), vault };
        timer.start(task, how?.mode ?? timer.state.prefs.mode, how?.minutes ?? timer.state.prefs.minutes);
        setCalendarWarning(undefined);
        setStartProblem(undefined);
      } catch (err) {
        setCalendarWarning(`The timer didn’t start: ${reason(err)}.`);
        setStartProblem(`The timer didn’t start: ${reason(err)}.`);
      }
    },
    [changeDay, timer, vault, plugins.timer],
  );
  const habitActions = useHabitActions({ root: vault, habits: habitCatalog.habits, onSaved: noteSaved, refresh, changeDay });
  // The menu bar item and its panel: the timer and today's tasks, published as they change; the
  // panel's buttons start, pause and stop this same timer.
  const todayEntry = useMemo(() => dayOf(now), [dayOf, now]);
  const unwritten = timer.state.pending.filter((block) => timer.failures.has(block.id)).length;
  const trayView = useMemo(
    () =>
      panelView({
        vault: vaultName,
        today: now,
        path: todayEntry.path,
        text: todayEntry.path === undefined ? undefined : texts.get(todayEntry.path),
        day: todayEntry.day,
        timer: timer.state,
        unwritten,
        problem: startProblem ?? (timer.saveError && `The timer couldn’t save itself: ${timer.saveError}`),
      }),
    [vaultName, now, todayEntry, texts, timer.state, timer.saveError, unwritten, startProblem],
  );
  const startFromTray = useCallback((choice: TaskChoice, how: FocusHow) => void startTimer(choice, how), [startTimer]);
  // Opening the panel had it show today's list again; the start was on the day before's.
  const staleFromTray = useCallback(() => setStartProblem('The timer didn’t start: that list was another day’s. Today’s tasks are shown now.'), []);
  useTrayBridge(timer, trayView, startFromTray, staleFromTray, plugins.timer);
  const textOf = useCallback((path: string) => texts.get(path), [texts]);
  const frontNote = notePath(view);
  // Laid out only while it can be seen.
  const local = useLocalGraph(graph, frontNote, plugins.graph && right.open && !right.closed.includes('graph'));
  const categories = dailyFacts.categories.length ? dailyFacts.categories : ['code', 'study', 'sport', 'business', 'book', 'kaizen'];

  if (!status) return null;
  if (status.state !== 'open') {
    return (
      <NoVault
        message={status.state === 'error' ? status.message : undefined}
        onOpenFolder={() => void chooseFolder()}
        onCreateVault={() => void chooseFolder(true)}
        folderError={folderError}
      />
    );
  }

  if (setup) return <ErrorBoundary label="Vault setup" key={status.root}>
    <VaultSetup key={status.root} name={status.name} create={setup === 'create'} periodic={periodic} recognition={recognition} files={files} texts={texts} folders={folders} onSave={finishSetup} onSkip={() => finishSetup(periodic, recognition)} />
  </ErrorBoundary>;

  return (
    <PluginDisplayProvider value={pluginDisplay}><div className={['app', right.open && !assistantOpen && 'has-right', assistantOpen && 'has-assistant', !leftOpen && 'without-left'].filter(Boolean).join(' ')}>
      {leftOpen && <Sidebar
        plugins={plugins}
        vaultName={status.name}
        tree={tree}
        selected={view.kind === 'note' ? view.path : undefined}
        isFolderOpen={explorer.isOpen}
        onToggleFolder={explorer.toggle}
        onCollapseFolders={explorer.collapseAll}
        onOpenNote={openNote}
        onHome={(newTab) => go(HOME, newTab)}
        onNewNote={newNote}
        onNewFolder={newFolder}
        onNewBase={plugins.bases ? () => go({ kind: 'new', item: 'base', folder: creationFolder(preferences.fileDefaults, 'note', view.kind === 'note' ? view.path : undefined) }) : undefined}
        onOpenFolder={() => void chooseFolder()}
        onSettings={(newTab) => go({ kind: 'settings' }, newTab)}
        onGraph={(newTab) => go({ kind: 'graph' }, newTab)}
        onCalendar={(newTab) => go({ kind: 'calendar' }, newTab)}
        onLibrary={(newTab) => openLibrary('all', newTab)}
        onQuests={(newTab) => go({ kind: 'quests' }, newTab)}
        onHabits={(newTab) => go({ kind: 'habits' }, newTab)}
        onStatistics={(newTab) => go({ kind: 'statistics' }, newTab)}
        onNoteMenu={(path, x, y) => { if (!/\.base$/i.test(path)) setNoteMenu({ path, x, y }); }}
        timer={plugins.timer && <TimerPill timer={timer} onOpen={() => go({ kind: 'calendar' })} />}
        folderError={folderError}
        calendar={
          plugins.periodic && <Calendar
            calendarEnabled={plugins.calendar}
            month={month}
            onMonthChange={setMonth}
            has={(period, date) => catalog.matches.has(periodKey(period, date))}
            selected={view.kind === 'note' ? catalog.byPath.get(view.path) : undefined}
            onOpen={openPeriodicOrSay}
            onOpenCalendar={(newTab) => go({ kind: 'calendar' }, newTab)}
          />
        }
      />}
      <div className="workspace">
        <TabBar
          ws={ws}
          onActivate={(id) => update((prev) => activate(prev, id))}
          onClose={(id) => update((prev) => closeTab(prev, id))}
          onPin={(id, pinned) => update((prev) => setPinned(prev, id, pinned))}
          onNewTab={newTab}
          onBack={() => update((prev) => goBack(prev))}
          onForward={() => update((prev) => goForward(prev))}
          leftOpen={leftOpen}
          onToggleLeft={toggleLeft}
          rightOpen={right.open}
          onToggleRight={toggleRight}
          onAssistant={plugins.spike ? () => setAssistantOpen((open) => !open) : undefined}
          assistantOpen={assistantOpen}
        />
        <main className={view.kind === 'graph' ? 'main is-graph' : view.kind === 'settings' ? 'main is-preferences' : 'main'} ref={main} onScroll={onScroll}>
          {/* Only the tab in front is drawn, afresh for each tab: an editor leaving saves as it goes. */}
          <Fragment key={tab.id}>
            {view.kind === 'home' && !plugins.home && <MarkdownHome name={status.name} files={files} onOpen={openNote} onNew={newNote} onPlugins={() => go({ kind: 'settings' })} />}
            {view.kind !== 'home' && requiredPlugin(view.kind) && !plugins[requiredPlugin(view.kind)!] && <PluginUnavailable name={PLUGINS.find((item) => item.id === requiredPlugin(view.kind))!.name} onSettings={() => go({ kind: 'settings' })} />}
            {view.kind === 'home' && plugins.home && (
              <PluginSurface id="home"><Home
                sections={{ ...homeSections, profile: homeSections.profile && plugins.periodic, averages: homeSections.averages && plugins.periodic, focus: homeSections.focus && plugins.periodic, today: homeSections.today && plugins.periodic, spheres: homeSections.spheres && plugins.periodic, quests: homeSections.quests && plugins.quests, library: homeSections.library && plugins.library }}
                statisticsEnabled={plugins.statistics}
                vaultName={status.name}
                stats={{
                  notes: files.filter((file) => file.kind === 'note').length,
                  folders: countFolders(tree),
                  images: files.filter((file) => file.kind === 'image').length,
                }}
                today={todayNote.date}
                todayNote={todayNote}
                days={dailyNotes}
                dayOf={dayOf}
                exists={exists}
                scales={dailyFacts.scales}
                library={[...library.values()].flat()}
                birthDate={birthDate}
                onOpenNote={openNote}
                onOpenPeriod={openPeriodicOrSay}
                quests={quests}
                art={art}
                onQuestToggle={onQuestToggle}
                onQuestProgress={onQuestProgress}
                onQuestChange={onQuestChange}
                onSeeLibrary={() => openLibrary('all')}
                onSeeQuests={() => go({ kind: 'quests' })}
                onSeeStatistics={() => go({ kind: 'statistics' })}
                onSeeSummaries={() => go({ kind: 'summaries' })}
              /></PluginSurface>
            )}
            {view.kind === 'quests' && plugins.quests && <PluginSurface id="quests"><QuestPage quests={quests} art={art} today={todayNote.date} onToggle={onQuestToggle} onProgress={onQuestProgress} onChange={onQuestChange} /></PluginSurface>}
            {view.kind === 'habits' && plugins.habits && <PluginSurface id="habits"><HabitsPage enabled={features.habits} onOpenSettings={() => go({ kind: 'settings' })} habits={habitCatalog.habits} problems={habitCatalog.problems} days={recordedHabitDays} today={todayNote.date} {...habitActions} onOpenDay={(date) => openPeriodicOrSay('day', date)} onOpenNote={openNote} /></PluginSurface>}
            {view.kind === 'statistics' && plugins.statistics && <PluginSurface id="statistics"><StatisticsPage days={dailyNotes} dayOf={dayOf} today={todayNote.date} showHabits={features.habits} /></PluginSurface>}
            {view.kind === 'summaries' && plugins.statistics && <PluginSurface id="statistics"><Summaries scales={dailyFacts.scales} today={todayNote.date} days={dailyNotes} birthDate={birthDate} monthOf={monthOf} onOpenPeriod={openPeriodicOrSay} /></PluginSurface>}
            {fileActionError && <p className="note-warning" role="alert">{fileActionError}</p>}
            {editError && (
              <p className="note-warning" data-testid="edit-warning">
                {editError}
              </p>
            )}
            {view.kind === 'note' && (
              <BasesProvider key={status.root} onOpenSettings={() => go({ kind: 'settings', section: 'plugins' })} enabled={plugins.bases} root={status.root} files={files} texts={texts} onRefresh={refresh} onNoteSaved={noteSaved} onNewNote={(folder) => go({ kind: 'new', folder })} onRecover={(path, draft, problem) => showUnsaved(tab.id, path, draft, problem)}>
              {files.some((file) => file.path === view.path && (file.kind === 'image' || file.kind === 'attachment')) ? <AttachmentView file={files.find((file) => file.path === view.path)!} root={status.root} /> : /\.base$/i.test(view.path) ? <BaseDocument path={view.path} defaultView={view.baseView} onOpenLink={openLink} /> : <NoteView
                key={`${view.path}:${noteVersion}`}
                path={view.path}
                vaultRoot={status.root}
                basesEnabled={plugins.bases}
                onImageAdded={(path) => setFiles((previous) => previous.some((file) => file.path === path) ? previous : [...previous, { path, kind: 'image' }])}
                files={files}
                onOpenLink={openLink}
                editing={Boolean(view.editing)}
                onEditingChange={(editing) => setEditing(tab.id, editing)}
                onRename={() => chooseNoteAction(view.path, 'rename')}
                onSaved={noteSaved}
                onUnsaved={(path, text, message) => showUnsaved(tab.id, path, text, message)}
                linkTargets={linkTargets}
                periodic={periodicPage ? { ...periodicPage, focusThoughtRecord: assistantCbt?.path === view.path ? assistantCbt.token : undefined } : undefined}
                media={mediaPage}
                genreSuggestions={mediaPage ? genreCounts(library.get(mediaPage.spec.kind) ?? []).map(([name]) => name) : []}
                onManageHabits={() => go({ kind: 'habits' })}
                onHabitToggle={async (date, id, expected) => {
                  const habit = habitCatalog.habits.find((h) => h.id === id);
                  if (!habit) throw new Error('This habit is no longer available. Reopen Habits.');
                  await habitActions.onComplete(date, habit, expected, !expected);
                }}
                onQuestToggle={onQuestToggle}
                onQuestProgress={onQuestProgress}
                onQuestChange={onQuestChange}
                onOpenNote={openNote}
                onOpenPeriod={openPeriodicOrSay}
                onStartTimer={(choice, how) => void startTimer(choice, how)}
                onTaskChanged={taskChanged}
                known={texts.get(view.path)}
              />}
              </BasesProvider>
            )}
            {view.kind === 'calendar' && plugins.calendar && (
              <PluginSurface id="calendar"><CalendarView
                timerEnabled={plugins.timer}
                dayOf={dayOf}
                textOf={textOf}
                categories={categories}
                timer={timer}
                onStartTimer={(choice, how) => void startTimer(choice, how)}
                onOpenDay={(date) => openPeriodicOrSay('day', date)}
                onWrite={writeDay}
                onTaskChanged={taskChanged}
                vault={status.name}
                planCalendars={planCalendars}
                onChooseCalendar={chooseCalendar}
                warning={calendarWarning}
              /></PluginSurface>
            )}
            {view.kind === 'library' && plugins.library && (
              <PluginSurface id="library"><LibraryView
                library={library}
                files={files}
                tab={view.tab}
                onTab={(shown) => setLibraryTab(tab.id, shown)}
                layout={libraryLayout}
                onLayout={setLibraryLayout}
                hidden={libraryHidden}
                onHidden={setLibraryHidden}
                filters={savedLibraryFilters.filters}
                onFilters={savedLibraryFilters.change}
                filterError={savedLibraryFilters.error}
                onRetryFilters={savedLibraryFilters.retry}
                today={now}
                onOpenNote={openNote}
                onCreated={mediaCreated}
                onDelete={deleteLibraryNote}
                podcastArtwork={podcasts.artwork}
                sources={sources}
                onChanged={refresh}
              /></PluginSurface>
            )}
            {view.kind === 'missing' && <MissingNote target={view.target} onBack={back} />}
            {view.kind === 'unsaved' && <Unsaved path={view.path} text={view.text} message={view.message} />}
            {view.kind === 'new' && view.item === 'base' && <NewBase root={status.root} folder={view.folder} folders={folders} onCreated={async (path) => { await refresh(); openNote(path); }} />}
            {view.kind === 'new' && view.item !== 'base' && <NewNote key={`${tab.index}-${view.item ?? 'note'}`} kind={view.item ?? 'note'} folders={folders} folder={view.folder} onNewNote={(folder) => go({ kind: 'new', folder })} onCreate={view.item === 'folder' ? async (path) => { await createFolder(path); setFolders((previous) => [...new Set([...previous, path])]); } : create} />}
            {view.kind === 'graph' && plugins.graph && <PluginSurface id="graph"><GraphView graph={graph} onOpen={openNote} /></PluginSurface>}
            {view.kind === 'settings' && <SettingsScreen spikeSettings={(onBack) => <AssistantConfiguration value={assistantSettings} pluginEnabled={plugins.spike} profileExists={files.some((file) => file.path === assistantSettings.profilePath)} onSave={saveAssistantSettings} onOpenProfile={() => openNote(assistantSettings.profilePath)} onBack={onBack} />} pluginDisplay={pluginDisplay} initialSection={view.section} plugins={configuredPlugins} homeSections={homeSections} sources={sources} fileDefaults={preferences.fileDefaults} periodic={periodic} recognition={recognition} files={files} texts={texts} birthDate={typeof settings.birthDate === 'string' ? settings.birthDate : ''} podcasts={podcasts} features={features} folders={folders} onSave={saveSettings} />}
            {view.kind === 'problem' && <Problem title={view.title} message={view.message} onBack={back} />}
          </Fragment>
        </main>
      </div>
      {noteMenu && <NoteMenu {...noteMenu} onClose={() => setNoteMenu(undefined)} onPick={(action) => chooseNoteAction(noteMenu.path, action)} />}
      {noteAction && <NoteActionDialog key={`${noteAction.action}:${noteAction.path}`} {...noteAction} onClose={() => setNoteAction(undefined)} onRun={runNoteAction} />}
      {right.open && !assistantOpen && (
        <RightSidebar
          graphEnabled={plugins.graph}
          note={frontNote}
          backlinks={frontNote === undefined ? [] : (links.backlinks.get(frontNote) ?? [])}
          graph={local}
          closed={right.closed}
          onTogglePanel={togglePanel}
          onOpen={openNote}
        />
      )}
      {plugins.spike && <AssistantWorkspace key={status.root} context={{ root: status.root, now, files, texts, currentPath: frontNote, dailyPath: assistantCatalog.index.get(periodKey('day', now)), dailyAmbiguous: !assistantCatalog.index.has(periodKey('day', now)) && (assistantCatalog.matches.get(periodKey('day', now))?.length ?? 0) > 1, periodic, recognition, settings: assistantSettings }} open={assistantOpen} onOpen={() => setAssistantOpen(true)} onClose={() => setAssistantOpen(false)} onSaved={noteSaved} onRefresh={refresh} onOpenNote={(path, cbt) => { if (cbt) setAssistantCbt({ path, token: Date.now() }); openNote(path); }} onSaveSettings={saveAssistantSettings} />}
    </div></PluginDisplayProvider>
  );
}
