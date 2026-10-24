import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NoteView } from './components/NoteView';
import { Home, MissingNote, NoVault } from './components/Screens';
import { Sidebar } from './components/Sidebar';
import { listFiles, vaultStatus, type VaultFile, type VaultStatus } from './lib/api';
import { resolveLink } from './lib/links';
import { buildTree, countFolders } from './lib/tree';

type View = { kind: 'home' } | { kind: 'note'; path: string } | { kind: 'missing'; target: string };

const HOME: View = { kind: 'home' };

export function App() {
  const [status, setStatus] = useState<VaultStatus>();
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [history, setHistory] = useState<View[]>([HOME]);
  const view = history.at(-1) ?? HOME;
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await vaultStatus();
      const found = next.state === 'open' ? await listFiles() : [];
      if (cancelled) return;
      setFiles(found);
      setStatus(next);
    };
    load().catch((err: unknown) => {
      if (!cancelled) setStatus({ state: 'error', message: String(err) });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => main.current?.scrollTo(0, 0), [view]);

  const tree = useMemo(() => buildTree(files), [files]);
  const go = useCallback((next: View) => setHistory((prev) => [...prev, next]), []);
  const openLink = useCallback(
    (target: string, fromPath: string) => {
      const file = resolveLink(target, files, fromPath);
      if (!file) go({ kind: 'missing', target });
      else if (file.kind === 'note') go({ kind: 'note', path: file.path });
    },
    [files, go],
  );
  const back = history.length > 1 ? () => setHistory((prev) => prev.slice(0, -1)) : undefined;

  if (!status) return null;
  if (status.state !== 'open') return <NoVault message={status.state === 'error' ? status.message : undefined} />;

  return (
    <div className="app">
      <Sidebar
        vaultName={status.name}
        tree={tree}
        selected={view.kind === 'note' ? view.path : undefined}
        onOpenNote={(path) => go({ kind: 'note', path })}
        onHome={() => go(HOME)}
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
        {view.kind === 'note' && <NoteView key={view.path} path={view.path} files={files} onOpenLink={openLink} />}
        {view.kind === 'missing' && <MissingNote target={view.target} onBack={back} />}
      </main>
    </div>
  );
}
