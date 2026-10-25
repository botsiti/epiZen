import { useState, type FormEvent } from 'react';
import { formatDate, parseDate, today } from '../lib/dates';
import { PERIODS, startOfPeriod, type Period, type PeriodicSettings } from '../lib/periodic';

interface Props {
  periodic: PeriodicSettings;
  folders: string[];
  notes: string[];
  onSave: (periodic: PeriodicSettings) => Promise<void>;
}

const TITLES: Record<Period, string> = { day: 'Daily notes', week: 'Weekly notes', month: 'Monthly notes' };

/** Where periodic notes go, how they are named and which template they start from, as in Obsidian's daily notes settings. */
export function SettingsScreen({ periodic, folders, notes, onSave }: Props) {
  const [draft, setDraft] = useState(periodic);
  const [state, setState] = useState<{ saved?: boolean; error?: string }>({});
  const set = (period: Period, key: 'folder' | 'format' | 'template', value: string) => {
    setDraft((prev) => ({ ...prev, [period]: { ...prev[period], [key]: value } }));
    setState({});
  };
  // A format only works if a name made with it reads back as the same day.
  const example = (period: Period) => {
    const date = startOfPeriod(period, today());
    const name = formatDate(date, draft[period].format);
    return parseDate(name, draft[period].format)?.getTime() === date.getTime() ? name : undefined;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const broken = PERIODS.find((period) => !draft[period].format.trim() || !example(period));
    if (broken) {
      setState({ error: `Epizen can't read a ${TITLES[broken].toLowerCase().replace(/s$/, '')}'s name back into a date with that format.` });
      return;
    }
    onSave(draft).then(
      () => setState({ saved: true }),
      (err: unknown) => setState({ error: String(err) }),
    );
  };

  return (
    <section className="screen" data-testid="settings">
      <p className="eyebrow">Settings</p>
      <h1>Periodic notes</h1>
      <p className="muted">The calendar and links like [[24.10.2026]] open these notes, or create them from their template.</p>
      <form className="form" onSubmit={submit}>
        {PERIODS.map((period) => (
          <fieldset className="settings-group" key={period} data-testid={`settings-${period}`}>
            <legend className="eyebrow">{TITLES[period]}</legend>
            <label className="field">
              <span>Folder</span>
              <input value={draft[period].folder} onChange={(e) => set(period, 'folder', e.target.value)} list="vault-folders" placeholder="Top of the vault" />
            </label>
            <label className="field">
              <span>Name format</span>
              <input value={draft[period].format} onChange={(e) => set(period, 'format', e.target.value)} data-testid={`settings-${period}-format`} />
              <small className="field-hint">{example(period) ? `This ${period}: ${example(period)}` : 'This format doesn’t give a name Epizen can read back.'}</small>
            </label>
            <label className="field">
              <span>Template</span>
              <input value={draft[period].template} onChange={(e) => set(period, 'template', e.target.value)} list="vault-notes" placeholder="None" />
            </label>
          </fieldset>
        ))}
        <datalist id="vault-folders">
          {folders.map((folder) => (
            <option key={folder} value={folder} />
          ))}
        </datalist>
        <datalist id="vault-notes">
          {notes.map((note) => (
            <option key={note} value={note} />
          ))}
        </datalist>
        {state.error && <p className="form-error">{state.error}</p>}
        <div className="form-actions">
          <button type="submit" className="quiet-button" data-testid="settings-save">
            Save
          </button>
          {state.saved && <span className="save-state">Saved</span>}
        </div>
      </form>
    </section>
  );
}
