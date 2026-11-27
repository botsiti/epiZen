import { useEffect, useMemo, useRef, useState } from 'react';
import { readBase, type VaultFile } from '../../lib/api';
import { textIdentity } from '../../lib/text';
import { LibraryDialog } from '../library/LibraryDialog';

export function FileFinder({ mode, root, files, texts, recent, onOpen, onClose }: {
  mode: 'recent' | 'search'; root: string; files: VaultFile[]; texts: ReadonlyMap<string, string>;
  recent: readonly string[]; onOpen: (path: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(50);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [bases, setBases] = useState<ReadonlyMap<string, string>>(new Map());
  const [readErrors, setReadErrors] = useState(false);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (mode !== 'search') return;
    let active = true;
    const load = async () => {
      const content = new Map<string, string>();
      let failed = false;
      for (const file of files) {
        if (!active) return;
        if (file.kind !== 'base') continue;
        try { content.set(file.path, await readBase(root, file.path)); }
        catch { failed = true; }
      }
      if (active) { setBases(content); setReadErrors(failed); }
    };
    void load();
    return () => { active = false; };
  }, [files, mode, root]);
  const matches = useMemo(() => {
    const needle = textIdentity(query);
    if (mode === 'recent') {
      const available = new Set(files.map(({ path }) => path));
      return recent.filter((path) => available.has(path) && textIdentity(path).includes(needle)).map((path) => ({ path, snippet: '' }));
    }
    if (!needle) return [];
    return files.flatMap(({ path }) => {
      if (textIdentity(path).includes(needle)) return [{ path, snippet: '' }];
      const content = texts.get(path) ?? bases.get(path);
      if (!content || !textIdentity(content).includes(needle)) return [];
      const line = content.split('\n').find((line) => textIdentity(line).includes(needle));
      return line ? [{ path, snippet: line.trim() }] : [];
    });
  }, [files, texts, bases, recent, mode, query]);
  const title = mode === 'recent' ? 'Open recent files' : 'Search in all files';
  return <LibraryDialog title={title} onClose={onClose}><div className="add-body file-finder">
    <input ref={input} type="search" aria-label={title} placeholder={mode === 'recent' ? 'Filter recently opened files…' : 'Search filenames and note text…'} value={query} onChange={(event) => { setQuery(event.target.value); setLimit(50); }} onKeyDown={(event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); list.current?.querySelector('button')?.focus(); }
      if (event.key === 'Enter' && matches[0]) { event.preventDefault(); onOpen(matches[0].path); }
    }} />
    <div className="file-finder-results" ref={list} onKeyDown={(event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const buttons = [...event.currentTarget.querySelectorAll('button')];
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      (event.key === 'ArrowUp' ? (buttons[at - 1] ?? input.current) : buttons[at + 1])?.focus();
    }}>
      {matches.slice(0, limit).map(({ path, snippet }) => <button key={path} type="button" onClick={() => onOpen(path)}><span>{path}</span>{snippet && <small>{snippet}</small>}</button>)}
      {limit < matches.length && <button type="button" onClick={() => setLimit(limit + 50)}>Show more files</button>}
    </div>
    {!matches.length && (query.trim() || mode === 'recent') && <p className="muted" role="status">{query.trim() ? 'No matching files.' : 'No files opened yet.'}</p>}
    {readErrors && <p className="muted" role="status">Some bases could only be searched by filename.</p>}
  </div></LibraryDialog>;
}
