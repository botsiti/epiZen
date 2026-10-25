import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Backlinks } from './components/Backlinks';
import { Calendar } from './components/Calendar';
import { NewNote } from './components/NewNote';
import { NoteView } from './components/NoteView';
import { Home, MissingNote, NoVault, Problem, Unsaved } from './components/Screens';
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
  updateSettings,
  vaultStatus,
  type Settings,
  type VaultFile,
  type VaultStatus,
} from './lib/api';
import type { LinkTarget } from './lib/completion';
import { addDays, startOfMonth, today } from './lib/dates';
import { buildLinkIndex } from './lib/linkIndex';
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
import { flushAll } from './lib/saving';
import { buildTree, countFolders } from './lib/tree';

type View =
  | { kind: 'home' }
  | { kind: 'note'; path: string; editing?: boolean }
  | { kind: 'missing'; target: string }
  | { kind: 'new'; folder: string }
  | { kind: 'unsaved'; path: string; text: string; message: string }
  | { kind: 'settings' }
  | { kind: 'problem'; title: string; message: string };

const HOME: View = { kind: 'home' };

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
    const now = today();
    for (const [offset, detail] of [[0, 'today'], [-1, 'yesterday'], [1, 'tomorrow']] as const) {
      const path = periodicPath('day', addDays(now, offset), periodic).replace(/\.md$/i, '');
      if (!titles.has(noteTitle(path))) targets.push({ label: noteTitle(path), detail });
    }
    return targets;
  }, [notes, periodic]);
  // Reads the vault's files and texts again after the app created a note.
  const refresh = useCallback(async () => {
    const [found, read] = await Promise.all([listFiles(), readAllNotes()]);
    setFiles(found);
    setTexts(new Map(read.map((note) => [note.path, note.text])));
  }, []);
  const noteSaved = useCallback((path: string, text: string) => setTexts((prev) => new Map(prev).set(path, text)), []);
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

  const create = useCallback(
    async (path: string) => {
      await createNote(path, '');
      go({ kind: 'note', path, editing: true });
      // The note exists now; reading the vault again only updates the sidebar and links.
      refresh().catch(() => undefined);
    },
    [go, refresh],
  );

  // A day, week or month opens its note, or creates it in its folder from its template.
  const openPeriodic = useCallback(
    async (period: Period, date: Date) => {
      const existing = periodicNotes.get(periodKey(period, date));
      if (existing) {
        go({ kind: 'note', path: existing });
        return;
      }
      const path = periodicPath(period, date, periodic);
      try {
        await createNote(path, await periodicText(period, date, path, periodic, files));
      } catch (err) {
        // Created a moment ago, or named by a file the index doesn't know as this period's note.
        if (!String(err).includes('already exists')) throw err;
      }
      await refresh();
      go({ kind: 'note', path });
    },
    [files, go, periodic, periodicNotes, refresh],
  );
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
  const saveSettings = useCallback(async (next: PeriodicSettings) => setSettings(await updateSettings({ periodic: next })), []);

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
        folderError={folderError}
        calendar={
          <Calendar
            month={month}
            onMonthChange={setMonth}
            has={(period, date) => periodicNotes.has(periodKey(period, date))}
            selected={view.kind === 'note' ? periodOf(view.path, periodic) : undefined}
            onOpen={openPeriodicOrSay}
          />
        }
      />
      <main className="main" ref={main}>
        {view.kind === 'home' && (
          <Home
            vaultName={status.name}
            notes={files.filter((file) => file.kind === 'note').length}
            folders={countFolders(tree)}
            images={files.filter((file) => file.kind === 'image').length}
          />
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
            footer={<Backlinks links={links.backlinks.get(view.path) ?? []} onOpen={(path) => go({ kind: 'note', path })} />}
          />
        )}
        {view.kind === 'missing' && <MissingNote target={view.target} onBack={back} />}
        {view.kind === 'unsaved' && <Unsaved path={view.path} text={view.text} message={view.message} />}
        {view.kind === 'new' && <NewNote key={history.length} folders={folders} folder={view.folder} onCreate={create} />}
        {view.kind === 'settings' && <SettingsScreen periodic={periodic} folders={folders} notes={notes} onSave={saveSettings} />}
        {view.kind === 'problem' && <Problem title={view.title} message={view.message} onBack={back} />}
      </main>
    </div>
  );
}
