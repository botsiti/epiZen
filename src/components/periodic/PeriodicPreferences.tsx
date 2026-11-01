import { useId, useMemo, useState } from 'react';
import type { VaultFile } from '../../lib/api';
import { formatDate, parseDate, today } from '../../lib/dates';
import { PERIODS, periodicCatalog, periodicPath, startOfPeriod, type Period, type PeriodicRecognition, type PeriodicSettings } from '../../lib/periodic';
import { DateField } from '../DateField';

const PERIOD_TITLES: Record<Period, string> = { day: 'Daily notes', week: 'Weekly notes', month: 'Monthly notes' };

export function PeriodicFolders({ value, folders, onChange }: { value: PeriodicSettings; folders: string[]; onChange: (next: PeriodicSettings) => void }) {
  const id = useId();
  return <>
    {PERIODS.map((period) => <fieldset className="settings-group" key={period} data-testid={`settings-${period}`}>
      <legend className="eyebrow">{PERIOD_TITLES[period]}</legend>
      <label className="field"><span>Folder</span><input aria-label={`${PERIOD_TITLES[period]} folder`} value={value[period].folder} onChange={(event) => onChange({ ...value, [period]: { ...value[period], folder: event.target.value } })} list={`${id}-folders`} placeholder="Top of the vault" /></label>
      <label className="field"><span>Future note names</span><input value={value[period].format} onChange={(event) => onChange({ ...value, [period]: { ...value[period], format: event.target.value } })} data-testid={`settings-${period}-format`} list={`${id}-${period}`} />
        <small className="field-hint">This {period}: {periodicPath(period, today(), value)}<br />Only new notes use this pattern. Earlier names and locations remain readable.</small>
      </label>
      <datalist id={`${id}-${period}`}>{(period === 'day' ? ['YYYY-MM-DD', 'DD.MM.YYYY', 'MMMM D, YYYY', 'YYYY/[days]/YYYY-MM-DD'] : period === 'week' ? ['GGGG-[W]WW', 'GGGG-[W]WW - DD.MM.YY', 'GGGG/[weeks]/GGGG-[W]WW'] : ['YYYY-MM', 'MMMM YYYY', 'MM.YY [RPG]', 'YYYY/[months]/YYYY-MM']).map((format) => <option key={format} value={format} />)}</datalist>
    </fieldset>)}
    <datalist id={`${id}-folders`}>{folders.map((folder) => <option key={folder} value={folder} />)}</datalist>
  </>;
}

export function PeriodicRecognitionFields({ periodic, value, files, texts, onChange }: { periodic: PeriodicSettings; value: PeriodicRecognition; files: VaultFile[]; texts: ReadonlyMap<string, string>; onChange: (next: PeriodicRecognition) => void }) {
  const id = useId();
  const [path, setPath] = useState('');
  const [period, setPeriod] = useState<Period | 'none'>('day');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const catalog = useMemo(() => periodicCatalog(files, periodic, texts, value), [files, periodic, texts, value]);
  const conflicts = [...catalog.matches].filter(([, paths]) => paths.length > 1);
  const link = () => {
    const parsed = parseDate(date, 'YYYY-MM-DD');
    if (!files.some((file) => file.kind === 'note' && file.path === path) || (period !== 'none' && !parsed)) { setError('Choose an existing note and a valid date.'); return; }
    const entry = period !== 'none' && parsed ? { period, date: formatDate(startOfPeriod(period, parsed), 'YYYY-MM-DD') } : null;
    onChange({ ...value, dates: { ...value.dates, [path]: entry } });
    setError(''); setPath('');
  };
  return <fieldset className="settings-group periodic-recognition" data-testid="periodic-recognition">
    <legend className="eyebrow">Existing notes</legend>
    <p className="muted">{catalog.byPath.size} notes recognized. Names can vary from one note to the next. Your Markdown stays as it is.</p>
    <label className="field"><span>Ambiguous dates</span><select value={value.dateOrder} onChange={(event) => onChange({ ...value, dateOrder: event.target.value === 'mdy' ? 'mdy' : 'dmy' })}>
      <option value="dmy">Day first · 03-04 is 3 April</option><option value="mdy">Month first · 03-04 is March 4</option>
    </select><small className="field-hint">Used for older numeric names. A note’s explicit date takes priority.</small></label>
    {conflicts.map(([key, paths]) => <label className="field" key={key}><span>Choose the calendar note · {key}</span><select aria-label={`Calendar note for ${key}`} value={catalog.index.get(key) ?? ''} onChange={(event) => onChange({ ...value, preferred: { ...value.preferred, [key]: event.target.value } })}>
      <option value="">Choose a note…</option>{paths.map((path) => <option key={path}>{path}</option>)}
    </select><small className="field-hint">Both files stay intact. The calendar and statistics use your choice.</small></label>)}
    <details><summary>Link an older note or correct its date</summary>
      <p className="muted">For an unusual name, another language, or a date that cannot be inferred. This link is kept in app settings, without editing the note.</p>
      <label className="field"><span>Existing note</span><input value={path} onChange={(event) => setPath(event.target.value)} list={`${id}-notes`} /></label>
      <datalist id={`${id}-notes`}>{files.filter((file) => file.kind === 'note').map((file) => <option key={file.path} value={file.path} />)}</datalist>
      <label className="field"><span>Note kind</span><select value={period} onChange={(event) => setPeriod(event.target.value as Period | 'none')}><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option><option value="none">Leave out of the calendar</option></select></label>
      {period !== 'none' && <label className="field"><span>Date</span><DateField value={date} onChange={setDate} label="Note date" testId="periodic-link-date" /></label>}
      {error && <p role="alert">{error}</p>}
      <button type="button" className="quiet-button" onClick={link}>Apply link</button>
      {Object.entries(value.dates).map(([path, linked]) => <p className="periodic-linked-note" key={path}><span>{path} · {linked ? `${linked.period} ${linked.date}` : 'Not on the calendar'}</span><button type="button" className="quiet-button" onClick={() => { const dates = { ...value.dates }; delete dates[path]; onChange({ ...value, dates }); }}>Reset</button></p>)}
    </details>
  </fieldset>;
}
