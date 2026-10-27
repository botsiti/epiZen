import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Backlinks } from './components/Backlinks';
import { Calendar } from './components/Calendar';
import { CalendarView } from './components/calendar/CalendarView';
import { chime } from './components/calendar/chime';
import { TimerPill } from './components/calendar/Timer';
import type { FocusHow } from './components/calendar/FocusMenu';
import type { TaskChoice } from './components/calendar/types';
import { reason, useNoteWriter } from './components/calendar/useNoteWriter';
import { useTimer, type TimerDeps } from './components/calendar/useTimer';
import { GraphView } from './components/GraphView';
import { NewNote } from './components/NewNote';
import { NoteView } from './components/NoteView';
import { Home } from './components/home/Home';
import { LibraryView } from './components/library/LibraryView';
import type { PeriodicSpec } from './components/periodic/types';
import { MissingNote, NoVault, Problem, Unsaved } from './components/Screens';
import { SettingsScreen } from './components/SettingsScreen';
import { Sidebar } from './components/Sidebar';
import {
  closeNow,
  createNote,
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
import { addBlock, addTaskWithBlock, findTask, focusIdOf, hasTask, newTaskLabel } from './lib/timeblocks';
import { dayKey, dayOfKey, type PendingBlock } from './lib/timer';
import { buildGraph } from './lib/graph';
import { parseBirthDate } from './lib/home';
import { buildLinkIndex } from './lib/linkIndex';
import { collectLibrary, kindOfFolder, kindOfPath, type MediaKind } from './lib/library';
import { collectMedia } from './lib/media';
import { noteFolder, noteTitle, resolveLink } from './lib/links';
import {
  fillTemplate,
  periodicIndex,
  periodicPath,
  periodicSettings,
  periodKey,
  periodOf,
  periodOfName,
  startOfPeriod,
  type Period,
  type PeriodicSettings,
} from './lib/periodic';
import { artPaths, parseQuests, setQuestProgress, toggleQuest, type Quest, type QuestEntry } from './lib/quests';
import { metricScale, type DayEntry } from './lib/rollup';
import { flushAll } from './lib/saving';
import { useToday } from './lib/useToday';
import { buildTree, countFolders } from './lib/tree';

type View =
  | { kind: 'home' }
  | { kind: 'note'; path: string; editing?: boolean }
  | { kind: 'missing'; target: string }
  | { kind: 'new'; folder: string }
  | { kind: 'unsaved'; path: string; text: string; message: string }
  | { kind: 'settings' }
  | { kind: 'graph' }
  | { kind: 'calendar' }
  | { kind: 'library'; tab: MediaKind }
  | { kind: 'problem'; title: string; message: string };

const HOME: View = { kind: 'home' };

// Each daily note parsed once per text it has had: saves and new notes bring new text.
const parsedDays = new Map<string, { text: string; day: Day }>();
function dayFrom(path: string, text: string): Day {
  const cached = parsedDays.get(path);
  if (cached?.text === text) return cached.day;
  const day = parseDay(text);
  parsedDays.set(path, { text, day });
  return day;
}

/** A new periodic note's text: its template filled in, or nothing when it has none. */
async function periodicText(period: Period, date: Date, path: string, periodic: PeriodicSettings, files: VaultFile[]) {
  const { template, format } = periodic[period];
  if (!template.trim()) return '';
  const file = resolveLink(template.trim(), files);
  if (file?.kind !== 'note') throw new Error(`There is no template note “${template}”. Check it in Settings.`);
  return fillTemplate(await readNote(file.path), { title: noteTitle(path), date: startOfPeriod(period, date), format, now: new Date() });
}

export function App() {
  const [status, setStatus] = useState<VaultStatus>();
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [history, setHistory] = useState<View[]>([HOME]);
  const [loads, setLoads] = useState(0);
  const [folderError, setFolderError] = useState<string>();
  const [settings, setSettings] = useState<Settings>({});
  // Every note's text, for links, backlinks and the graph. Saves and new notes keep it current.
  const [texts, setTexts] = useState<ReadonlyMap<string, string>>(new Map());
  const [month, setMonth] = useState(() => startOfMonth(today()));
  const view = history.at(-1) ?? HOME;
  const main = useRef<HTMLElement>(null);
  const now = useToday();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await vaultStatus();
      const found = next.state === 'open' ? await listFiles() : [];
      const read = next.state === 'open' ? await readAllNotes() : [];
      const stored = await getSettings();
      if (cancelled) return;
      setFiles(found);
      setTexts(new Map(read.map((note) => [note.path, note.text])));
      setSettings(stored);
      setStatus(next);
    };
    load().catch((err: unknown) => {
      if (!cancelled) setStatus({ state: 'error', message: String(err) });
    });
    return () => {
      cancelled = true;
    };
  }, [loads]);

  // A new screen starts at the top; switching a note between reading and editing doesn't.
  const place = view.kind === 'note' ? view.path : view.kind;
  useEffect(() => main.current?.scrollTo(0, 0), [place]);

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

  const tree = useMemo(() => buildTree(files), [files]);
  const folders = useMemo(
    () => [...new Set(files.filter((file) => file.kind === 'note').map((file) => noteFolder(file.path)))].filter(Boolean).sort(),
    [files],
  );
  const notes = useMemo(() => files.filter((file) => file.kind === 'note').map((file) => file.path.replace(/\.md$/i, '')), [files]);
  const periodic = useMemo(() => periodicSettings(settings), [settings]);
  const periodicNotes = useMemo(() => periodicIndex(files, periodic), [files, periodic]);
  const go = useCallback((next: View) => setHistory((prev) => [...prev, next]), []);
  const links = useMemo(() => buildLinkIndex([...texts].map(([path, text]) => ({ path, text })), files), [texts, files]);
  const graph = useMemo(
    () => buildGraph(files.filter((file) => file.kind === 'note').map((file) => file.path), links.outgoing),
    [files, links],
  );
  const openNote = useCallback((path: string) => go({ kind: 'note', path }), [go]);
  const shelves = useMemo(() => collectMedia([...texts].map(([path, text]) => ({ path, text })), files), [texts, files]);
  const library = useMemo(() => collectLibrary([...texts].map(([path, text]) => ({ path, text })), files), [texts, files]);
  const openLibrary = useCallback((tab: MediaKind) => go({ kind: 'library', tab }), [go]);
  // The library remembers its tab in its place in the history, so coming back finds it again.
  const setLibraryTab = useCallback(
    (tab: MediaKind) => setHistory((prev) => prev.map((v, i) => (i === prev.length - 1 && v.kind === 'library' ? { ...v, tab } : v))),
    [],
  );
  const mediaPage = useMemo(() => {
    const spec = view.kind === 'note' ? kindOfPath(view.path) : undefined;
    return spec && { spec, onOpenLibrary: () => openLibrary(spec.kind) };
  }, [view, openLibrary]);
  const todayNote = useMemo(
    () => ({ date: now, path: periodicNotes.get(periodKey('day', now)), name: noteTitle(periodicPath('day', now, periodic)) }),
    [now, periodic, periodicNotes],
  );
  // Everything a daily, weekly or monthly note's page reads from the rest of the vault.
  const dayOf = useCallback(
    (date: Date): DayEntry => {
      const path = periodicNotes.get(periodKey('day', date));
      const text = path === undefined ? undefined : texts.get(path);
      return { date, path, day: path === undefined || text === undefined ? undefined : dayFrom(path, text) };
    },
    [periodicNotes, texts],
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
  // Weekly quests from weekly notes, monthly ones from monthly notes, mythic ones from Custom Quests.md.
  const quests = useMemo(() => {
    const list: QuestEntry[] = [];
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
  }, [periodicNotes, texts, files]);
  const images = useMemo(() => new Set(files.filter((file) => file.kind === 'image').map((file) => file.path)), [files]);
  const art = useCallback((quest: Quest) => artPaths(quest).find((path) => images.has(path)), [images]);
  const periodicPage = useMemo((): PeriodicSpec | undefined => {
    const found = view.kind === 'note' ? periodOf(view.path, periodic) : undefined;
    if (!found) return undefined;
    const categories = dailyFacts.categories.length ? dailyFacts.categories : ['code', 'study', 'sport', 'business', 'book', 'kaizen'];
    return { period: found.period, date: found.date, dayOf, weekOf, exists, scales: dailyFacts.scales, media: mediaByTitle, categories, quests, art };
  }, [view, periodic, dayOf, weekOf, exists, dailyFacts, mediaByTitle, quests, art]);
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
    const [found, read] = await Promise.all([listFiles(), readAllNotes()]);
    setFiles(found);
    setTexts(new Map(read.map((note) => [note.path, note.text])));
  }, []);
  const noteSaved = useCallback((path: string, text: string) => setTexts((prev) => new Map(prev).set(path, text)), []);
  // Changes to a note other than the open one (a quest in its weekly note or Custom Quests.md): one
  // at a time, each over the note as it is on disk now, and written only while it still holds that.
  const edits = useRef(Promise.resolve());
  const [editError, setEditError] = useState<string>();
  const editNote = useCallback(
    (path: string, edit: (text: string) => string, failed: string) => {
      edits.current = edits.current.then(async () => {
        try {
          const current = await readNote(path);
          const next = edit(current);
          if (next === current) return;
          await writeNote(path, next, current);
          noteSaved(path, next);
          setEditError(undefined);
        } catch (err) {
          setEditError(`${failed}: ${err instanceof Error ? err.message : String(err)}`);
          const fresh = await readNote(path).catch(() => undefined);
          if (fresh !== undefined) noteSaved(path, fresh);
        }
      });
    },
    [noteSaved],
  );
  const onQuestToggle = useCallback((quest: Quest) => editNote(quest.path, (text) => toggleQuest(text, quest, new Date()), 'The quest wasn\'t changed'), [editNote]);
  const onQuestProgress = useCallback(
    (quest: Quest, value: number) => editNote(quest.path, (text) => setQuestProgress(text, quest, value, new Date()), 'The quest wasn\'t changed'),
    [editNote],
  );
  const back = history.length > 1 ? () => setHistory((prev) => prev.slice(0, -1)) : undefined;
  const setEditing = useCallback(
    (editing: boolean) => setHistory((prev) => prev.map((v, i) => (i === prev.length - 1 && v.kind === 'note' ? { ...v, editing } : v))),
    [],
  );

  const chooseFolder = useCallback(async () => {
    setFolderError(undefined);
    try {
      if (!(await pickVault())) return;
      setHistory([HOME]);
      setLoads((n) => n + 1);
    } catch (err) {
      // The vault that was open stays open.
      setFolderError(String(err));
    }
  }, []);

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

  // A day, week or month's note: the one it has, or a new one created in its folder from its
  // template. The calendar and the timer use this too, without opening the note.
  const ensurePeriodic = useCallback(
    async (period: Period, date: Date): Promise<string> => {
      const existing = periodicNotes.get(periodKey(period, date));
      if (existing) return existing;
      const path = periodicPath(period, date, periodic);
      try {
        await createNote(path, await periodicText(period, date, path, periodic, files));
      } catch (err) {
        // Created a moment ago, or named by a file the index doesn't know as this period's note.
        if (!String(err).includes('already exists')) throw err;
      }
      await refresh();
      return path;
    },
    [files, periodic, periodicNotes, refresh],
  );
  // A day, week or month opens its note, creating it first if it has none.
  const openPeriodic = useCallback(async (period: Period, date: Date) => go({ kind: 'note', path: await ensurePeriodic(period, date) }), [ensurePeriodic, go]);
  const openPeriodicOrSay = useCallback(
    (period: Period, date: Date) =>
      void openPeriodic(period, date).catch((err: unknown) =>
        go({ kind: 'problem', title: "Couldn't create the note", message: String(err) }),
      ),
    [go, openPeriodic],
  );
  // A link to a missing day, week or month creates that note, like the calendar; any other
  // missing note is only explained, never created.
  const openLink = useCallback(
    (target: string, fromPath: string) => {
      const file = resolveLink(target, files, fromPath);
      const named = file ? undefined : periodOfName(target, periodic);
      if (named) openPeriodicOrSay(named.period, named.date);
      else if (!file) go({ kind: 'missing', target });
      else if (file.kind === 'note') go({ kind: 'note', path: file.path });
    },
    [files, go, periodic, openPeriodicOrSay],
  );
  // An empty birth date removes the setting rather than keeping an empty one.
  const saveSettings = useCallback(
    async (next: { periodic: PeriodicSettings; birthDate: string }) =>
      setSettings(await updateSettings({ periodic: next.periodic, birthDate: next.birthDate.trim() || null })),
    [],
  );

  // The calendar's and the timer's writes: one at a time, over the text the app last read.
  const changeNote = useNoteWriter(texts, noteSaved);
  const [calendarWarning, setCalendarWarning] = useState<string>();
  // Which vault is open, by its folder: a timed block is only ever written into the vault it was timed in.
  const vault = status?.state === 'open' ? status.root : undefined;
  // Changes a day's note. A day without one gets it from its template with the change already
  // in: if the change can't be made (a template without a Tasks heading), no note is created.
  const changeDay = useCallback(
    async (date: Date, edit: (text: string) => string | undefined): Promise<{ path: string; text: string }> => {
      const existing = periodicNotes.get(periodKey('day', date));
      if (existing) return { path: existing, text: await changeNote(existing, edit) };
      const path = periodicPath('day', date, periodic);
      const template = await periodicText('day', date, path, periodic, files);
      const text = edit(template) ?? template;
      try {
        await createNote(path, text);
      } catch (err) {
        // Created a moment ago: change the note as it is.
        if (!String(err).includes('already exists')) throw err;
        await refresh();
        return { path, text: await changeNote(path, edit) };
      }
      await refresh();
      return { path, text };
    },
    [changeNote, files, periodic, periodicNotes, refresh],
  );
  const writeDay = useCallback(
    async (date: Date, edit: (text: string) => string, failed: string) => {
      try {
        await changeDay(date, edit);
        setCalendarWarning(undefined);
      } catch (err) {
        setCalendarWarning(`${failed}: ${reason(err)}. The calendar shows the note as it is now.`);
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
  const timer = useTimer(timerDeps, settings.timer, status?.state === 'open');
  // Done in the editor: the blocks that waited for it go in now.
  const wasEditing = useRef(editingPath);
  useEffect(() => {
    if (wasEditing.current !== undefined && editingPath === undefined) timer.retryAll();
    wasEditing.current = editingPath;
  }, [editingPath, timer]);
  // The timer starts on one of today's tasks, or on a new one added to today's note first:
  // as the timer card is set, or as a right-click asked (a stopwatch, or a pomodoro round).
  const startTimer = useCallback(
    async (choice: TaskChoice, how?: FocusHow) => {
      if (!vault) return;
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
      } catch (err) {
        setCalendarWarning(`The timer didn’t start: ${reason(err)}.`);
      }
    },
    [changeDay, timer, vault],
  );
  const textOf = useCallback((path: string) => texts.get(path), [texts]);
  const categories = dailyFacts.categories.length ? dailyFacts.categories : ['code', 'study', 'sport', 'business', 'book', 'kaizen'];

  if (!status) return null;
  if (status.state !== 'open') {
    return (
      <NoVault
        message={status.state === 'error' ? status.message : undefined}
        onOpenFolder={() => void chooseFolder()}
        folderError={folderError}
      />
    );
  }

  return (
    <div className="app">
      <Sidebar
        vaultName={status.name}
        tree={tree}
        selected={view.kind === 'note' ? view.path : undefined}
        onOpenNote={(path) => go({ kind: 'note', path })}
        onHome={() => go(HOME)}
        onNewNote={() => go({ kind: 'new', folder: view.kind === 'note' ? noteFolder(view.path) : '' })}
        onOpenFolder={() => void chooseFolder()}
        onSettings={() => go({ kind: 'settings' })}
        onGraph={() => go({ kind: 'graph' })}
        onCalendar={() => go({ kind: 'calendar' })}
        onLibrary={() => openLibrary('album')}
        timer={<TimerPill timer={timer} onOpen={() => go({ kind: 'calendar' })} />}
        folderError={folderError}
        calendar={
          <Calendar
            month={month}
            onMonthChange={setMonth}
            has={(period, date) => periodicNotes.has(periodKey(period, date))}
            selected={view.kind === 'note' ? periodOf(view.path, periodic) : undefined}
            onOpen={openPeriodicOrSay}
            onOpenCalendar={() => go({ kind: 'calendar' })}
          />
        }
      />
      <main className={view.kind === 'graph' ? 'main is-graph' : 'main'} ref={main}>
        {view.kind === 'home' && (
          <Home
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
            shelves={shelves}
            birthDate={birthDate}
            onOpenNote={openNote}
            onOpenPeriod={openPeriodicOrSay}
            quests={quests}
            art={art}
            onQuestToggle={onQuestToggle}
            onQuestProgress={onQuestProgress}
            onSeeAll={(folder) => {
              const spec = kindOfFolder(folder);
              if (spec) openLibrary(spec.kind);
            }}
          />
        )}
        {editError && (
          <p className="note-warning" data-testid="edit-warning">
            {editError}
          </p>
        )}
        {view.kind === 'note' && (
          <NoteView
            key={view.path}
            path={view.path}
            files={files}
            onOpenLink={openLink}
            editing={Boolean(view.editing)}
            onEditingChange={setEditing}
            onSaved={noteSaved}
            onUnsaved={(path, text, message) => go({ kind: 'unsaved', path, text, message })}
            linkTargets={linkTargets}
            footer={<Backlinks links={links.backlinks.get(view.path) ?? []} onOpen={openNote} />}
            periodic={periodicPage}
            media={mediaPage}
            onQuestToggle={onQuestToggle}
            onQuestProgress={onQuestProgress}
            onOpenNote={openNote}
            onOpenPeriod={openPeriodicOrSay}
            onStartTimer={(choice, how) => void startTimer(choice, how)}
            known={texts.get(view.path)}
          />
        )}
        {view.kind === 'calendar' && (
          <CalendarView
            dayOf={dayOf}
            textOf={textOf}
            categories={categories}
            timer={timer}
            onStartTimer={(choice, how) => void startTimer(choice, how)}
            onOpenDay={(date) => openPeriodicOrSay('day', date)}
            onWrite={writeDay}
            warning={calendarWarning}
          />
        )}
        {view.kind === 'library' && (
          <LibraryView
            library={library}
            files={files}
            tab={view.tab}
            onTab={setLibraryTab}
            today={now}
            onOpenNote={openNote}
            onCreated={mediaCreated}
          />
        )}
        {view.kind === 'missing' && <MissingNote target={view.target} onBack={back} />}
        {view.kind === 'unsaved' && <Unsaved path={view.path} text={view.text} message={view.message} />}
        {view.kind === 'new' && <NewNote key={history.length} folders={folders} folder={view.folder} onCreate={create} />}
        {view.kind === 'graph' && <GraphView graph={graph} onOpen={openNote} />}
        {view.kind === 'settings' && <SettingsScreen periodic={periodic} birthDate={typeof settings.birthDate === 'string' ? settings.birthDate : ''} folders={folders} notes={notes} onSave={saveSettings} />}
        {view.kind === 'problem' && <Problem title={view.title} message={view.message} onBack={back} />}
      </main>
    </div>
  );
}
