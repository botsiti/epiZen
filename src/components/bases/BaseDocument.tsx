import { useEffect, useRef, useState } from 'react';
import { readBase, writeBase } from '../../lib/api';
import { noteFolder, noteTitle } from '../../lib/links';
import { trackSave } from '../../lib/saving';
import { BaseBlock } from './BaseBlock';
import { useBases } from './context';

interface Props { path: string; from?: string; defaultView?: string; embedded?: boolean; onOpenLink: (target: string, from: string, newTab?: boolean) => void; onRecover?: (path: string, draft: string, problem: string) => void }
export function BaseDocument({ path, from, defaultView, embedded = false, onOpenLink, onRecover }: Props) {
  const data = useBases();
  const [loaded, setLoaded] = useState<{ path: string; source?: string; error?: string }>({ path });
  const [attempt, setAttempt] = useState(0);
  const root = data?.root;
  const active = useRef({ root, path });
  useEffect(() => { active.current = { root, path }; }, [root, path]);
  useEffect(() => {
    let cancelled = false;
    if (root) void readBase(root, path).then((source) => { if (!cancelled) setLoaded({ path, source }); }).catch((error: unknown) => { if (!cancelled) setLoaded({ path, error: String(error) }); });
    return () => { cancelled = true; };
  }, [root, path, attempt]);
  const source = loaded.path === path ? loaded.source : undefined;
  const refresh = async () => { if (!root) return; const source = await readBase(root, path); if (active.current.root === root && active.current.path === path) setLoaded({ path, source }); };
  const save = async (before: string, after: string) => {
    if (!root) throw new Error('The vault is unavailable.');
    const job = writeBase(root, path, after, before);
    void trackSave(job.then(() => undefined, () => path));
    await job; if (active.current.root === root && active.current.path === path) setLoaded({ path, source: after });
  };
  const content = loaded.error ? <div className="base-message" role="alert">Couldn’t read this base. {loaded.error}<button type="button" className="quiet-button" onClick={() => setAttempt(attempt + 1)}>Try again</button></div> : source === undefined ? <p className="base-message" role="status">Loading base…</p> : <BaseBlock source={source} path={from ?? path} defaultView={defaultView} onOpenLink={onOpenLink} onSaveSource={save} onRefreshSource={refresh} onRecover={(draft, problem) => (onRecover ?? data?.onRecover)?.(path, draft, problem)} />;
  return embedded ? <div className="base-embed" data-path={path}>{content}</div> : <article className="base-document" data-testid="base-document" data-path={path}><p className="eyebrow">{noteFolder(path) || 'Your vault'}</p><header className="base-document-head"><h1>{noteTitle(path)}</h1><small>Obsidian Base</small></header>{content}</article>;
}
