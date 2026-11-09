import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';
import { readNote, writeNoteScoped, type VaultFile } from '../../lib/api';
import { baseRows, type BaseRow } from '../../lib/bases/bases';
import { setBaseProperty } from '../../lib/bases/propertyEdits';
import { trackSave } from '../../lib/saving';

interface BaseData { rows: BaseRow[]; files: VaultFile[]; texts: ReadonlyMap<string, string>; root?: string; enabled: boolean; onRefresh: () => Promise<void>; onEditProperty?: (path: string, key: string, before: unknown, after: unknown) => Promise<void>; onRecover?: (path: string, draft: string, message: string) => void; onNewNote?: (folder: string) => void; onOpenSettings?: () => void }
const Context = createContext<BaseData | undefined>(undefined);
export function BasesProvider({ files, texts, root, enabled = true, onRefresh, onNoteSaved, onRecover, onNewNote, onOpenSettings, children }: { files: VaultFile[]; texts: ReadonlyMap<string, string>; root?: string; enabled?: boolean; onRefresh: () => Promise<void>; onNoteSaved?: (path: string, text: string) => void; onRecover?: BaseData['onRecover']; onNewNote?: (folder: string) => void; onOpenSettings?: () => void; children: ReactNode }) {
  const rows = useMemo(() => enabled ? baseRows(files, texts) : [], [files, texts, enabled]);
  const queue = useRef(Promise.resolve());
  const editProperty = useCallback((path: string, key: string, before: unknown, after: unknown) => {
    const job = queue.current.catch(() => undefined).then(async () => { if (!root || !enabled) throw new Error('Enable epiBase in this vault first.'); const current = await readNote(path); const next = setBaseProperty(current, key, before, after); if (next !== current) { await writeNoteScoped(root, path, next, current); onNoteSaved?.(path, next); } });
    queue.current = job; void trackSave(job.then(() => undefined, () => path)); return job;
  }, [root, enabled, onNoteSaved]);
  const value = useMemo(() => ({ rows, files, texts, root, enabled, onRefresh, onRecover, onNewNote, onOpenSettings, onEditProperty: root && enabled ? editProperty : undefined }), [rows, files, texts, root, enabled, onRefresh, editProperty, onRecover, onNewNote, onOpenSettings]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
// Used only by table UI, keeping vault indexing and I/O out of the query engine.
// eslint-disable-next-line react-refresh/only-export-components
export const useBases = () => useContext(Context);
