import { useState, type FormEvent } from 'react';
import { noteNameProblem } from '../lib/text';
import { PreferenceIcon } from './settings/icons';
import './workspace/creation.css';

interface Props {
  folders: string[];
  folder: string;
  kind?: 'note' | 'folder';
  onCreate: (path: string) => Promise<void>;
  onNewNote?: (folder: string) => void;
}

/** A create-only operation: a taken name leaves the draft visible so it can be corrected. */
export function NewNote({ folders, folder, kind = 'note', onCreate, onNewNote }: Props) {
  const [name, setName] = useState('');
  const [where, setWhere] = useState(folder);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string>();
  const basename = name.trim().normalize('NFC');
  const filename = kind === 'note' ? `${basename.replace(/\.md$/i, '') || 'Untitled'}.md` : basename || 'Untitled';
  const path = where ? `${where}/${filename}` : filename;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || created) return;
    const problem = noteNameProblem(name);
    if (problem) { setError(kind === 'folder' ? problem.replaceAll('note', 'folder') : problem); return; }
    setBusy(true); setError(undefined);
    try { await onCreate(path); if (kind === 'folder') setCreated(path); }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  };
  return <section className="screen creation-screen" data-testid={kind === 'note' ? 'new-note' : 'new-folder'}>
    <div className="creation-mark"><PreferenceIcon name={kind} /></div>
    <p className="eyebrow">Your vault</p><h1>{kind === 'note' ? 'A new thought' : 'A little more room'}</h1>
    <p className="muted">{kind === 'note' ? 'Give your note a name and a place to call home.' : 'Bring related notes together in a folder.'}</p>
    <form className="form creation-form" onSubmit={(event) => void submit(event)}>
      <fieldset disabled={busy || Boolean(created)}>
        <label className="field"><span>{kind === 'note' ? 'Note name' : 'Folder name'}</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === 'note' ? 'An idea worth keeping' : 'Projects'} autoFocus data-testid={`new-${kind}-name`} /></label>
        <label className="field"><span>{kind === 'note' ? 'Location' : 'Inside'}</span><select value={where} onChange={(event) => setWhere(event.target.value)} data-testid={`new-${kind}-folder`}><option value="">Top of the vault</option>{[...new Set([...folders, folder])].filter(Boolean).map((path) => <option key={path}>{path}</option>)}</select></label>
      </fieldset>
      <div className="creation-preview"><PreferenceIcon name={kind} /><span>{path}</span></div>
      {error && <p role="alert" className="form-error" data-testid={`new-${kind}-error`}>{error}</p>}
      {created ? <div className="creation-complete"><p role="status">Folder created.</p>{onNewNote && <button type="button" className="quiet-button" onClick={() => onNewNote(created)}>Create a note here</button>}</div> : <button type="submit" disabled={busy} className="quiet-button creation-submit" data-testid={`new-${kind}-create`}>{busy ? 'Creating…' : `Create ${kind}`}</button>}
    </form>
  </section>;
}
