import { useMemo, useState } from 'react';
import type { VaultFile } from '../../lib/api';
import { discoverDailyNotes } from '../../lib/dailyImport';
import type { PeriodicRecognition, PeriodicSettings } from '../../lib/periodic';
import { SettingRow } from './SettingRow';

export function DailyImport({ folders, files, texts, periodic, value, onChange }: { folders: string[]; files: VaultFile[]; texts: ReadonlyMap<string, string>; periodic: PeriodicSettings; value: PeriodicRecognition; onChange: (value: PeriodicRecognition) => void }) {
  const [folder, setFolder] = useState(periodic.day.folder);
  const [scanned, setScanned] = useState(false);
  const [connected, setConnected] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const found = useMemo(() => discoverDailyNotes(files, texts, folder, periodic, value), [files, texts, folder, periodic, value]);
  const duplicateCount = found.length - new Set(found.map((note) => note.date)).size;
  return <details className="preferences-disclosure" data-testid="daily-import">
    <summary><span><strong>Connect existing daily notes</strong><small>Find daily notes in this vault and add them to your calendar.</small></span></summary>
    <div className="preferences-disclosure-body">
      <SettingRow title="Look in" description="Includes notes in subfolders."><select aria-label="Daily notes to import" value={folder} onChange={(event) => { setFolder(event.target.value); setScanned(false); setConnected(false); }}><option value="">Entire vault</option>{[...new Set([...folders, periodic.day.folder])].filter(Boolean).map((path) => <option key={path}>{path}</option>)}</select></SettingRow>
      <SettingRow title="Dates in filenames" description="For example, how should 03-04-2026 be read?"><select aria-label="Dates in imported filenames" value={value.dateOrder} onChange={(event) => { onChange({ ...value, dateOrder: event.target.value === 'mdy' ? 'mdy' : 'dmy' }); setScanned(false); setConnected(false); }}><option value="dmy">3 April · day first</option><option value="mdy">March 4 · month first</option></select></SettingRow>
      <button type="button" className="quiet-button" onClick={() => { setScanned(true); setConnected(false); }}>Find daily notes</button>
      {scanned && <div className="daily-import-preview" aria-live="polite">
        <p><strong>{found.length} daily {found.length === 1 ? 'note' : 'notes'} found</strong>{duplicateCount > 0 && <span> · {duplicateCount} extra {duplicateCount === 1 ? 'note shares' : 'notes share'} a date</span>}</p>
        {found.length ? <><ul>{(showAll ? found : found.slice(0, 5)).map((note) => <li key={note.path}><span>{note.path}</span><time>{note.date}</time></li>)}</ul>{found.length > 5 && <button type="button" className="quiet-button" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${found.length} notes`}</button>}<p className="muted">Dates inside notes take priority. Review duplicate dates below before saving.</p><button type="button" className="quiet-button" disabled={connected} onClick={() => { onChange({ ...value, dates: { ...value.dates, ...Object.fromEntries(found.map(({ path, date }) => [path, { period: 'day' as const, date }])) } }); setConnected(true); }}>{connected ? 'Connected · save to apply' : `Connect ${found.length} notes`}</button></> : <p className="muted">Try another folder or date order. Notes with unusual names can be linked individually below.</p>}
        <p className="field-hint">Your files stay in place. Connecting notes saves their calendar dates in Epizen’s settings.</p>
      </div>}
    </div>
  </details>;
}
