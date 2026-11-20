import { useState, type FormEvent } from 'react';
import { noteNameProblem } from '../lib/text';
import { PreferenceIcon } from './settings/icons';
import './workspace/creation.css';

interface Props {
  folders: string[];
  folder: string;
  onCreate: (path: string) => Promise<void>;
}

/** A create-only operation: a taken name leaves the draft visible so it can be corrected. */
export function NewNote({ folders, folder, onCreate }: Props) {
  const [name, setName] = useState('');
  const [where, setWhere] = useState(folder);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const basename = name.trim().normalize('NFC');
  const filename = `${basename.replace(/\.md$/i, '') || 'Untitled'}.md`;
  const path = where ? `${where}/${filename}` : filename;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const problem = noteNameProblem(name);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(undefined);
    try { await onCreate(path); }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  };
  return <section className="screen creation-screen" data-testid="new-note">
    <h1>New note</h1>
    <form className="form creation-form" onSubmit={(event) => void submit(event)}>
      <fieldset disabled={busy}>
        <label className="field"><span>Note name</span><input value={name} onChange={(event) => setName(event.target.value)} autoFocus data-testid="new-note-name" /></label>
        <label className="field"><span>Location</span><select value={where} onChange={(event) => setWhere(event.target.value)} data-testid="new-note-folder"><option value="">Top of the vault</option>{[...new Set([...folders, folder])].filter(Boolean).map((path) => <option key={path}>{path}</option>)}</select></label>
      </fieldset>
      <div className="creation-preview"><PreferenceIcon name="note" /><span>{path}</span></div>
      {error && <p role="alert" className="form-error" data-testid="new-note-error">{error}</p>}
      <button type="submit" disabled={busy} className="quiet-button creation-submit" data-testid="new-note-create">{busy ? 'Creating…' : 'Create note'}</button>
    </form>
  </section>;
}
