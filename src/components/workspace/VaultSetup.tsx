import { useState } from 'react';
import type { VaultFile } from '../../lib/api';
import { today } from '../../lib/dates';
import { periodicNamingError, type PeriodicRecognition, type PeriodicSettings } from '../../lib/periodic';
import { STARTER_PERIODIC } from '../../lib/vaultSetup';
import { PeriodicFolders, PeriodicRecognitionFields } from '../periodic/PeriodicPreferences';
import './vaultSetup.css';

interface Props {
  name: string;
  create: boolean;
  periodic: PeriodicSettings;
  recognition: PeriodicRecognition;
  files: VaultFile[];
  texts: ReadonlyMap<string, string>;
  folders: string[];
  onSave: (periodic: PeriodicSettings, recognition: PeriodicRecognition, create: boolean) => Promise<void>;
  onSkip: () => Promise<void>;
}

export function VaultSetup({ name, create: initialCreate, periodic, recognition, files, texts, folders, onSave, onSkip }: Props) {
  const [create, setCreate] = useState(initialCreate);
  const [existing, setExisting] = useState<boolean>();
  const [draft, setDraft] = useState(periodic);
  const [reading, setReading] = useState(recognition);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (skip = false) => {
    if (busy) return;
    const next = create || existing === false ? STARTER_PERIODIC : draft;
    const problem = skip ? undefined : periodicNamingError(next);
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try { if (skip) await onSkip(); else await onSave(next, reading, create); }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  };
  return <main className="vault-setup settings-screen" data-testid="vault-setup">
    <p className="eyebrow">Welcome to {name}</p>
    <h1>{create ? 'A place for your second brain' : 'Bring your days with you'}</h1>
    <p className="muted">{create ? 'A small, ready-to-use library and calendar. Everything stays in ordinary Markdown files.' : 'Keep your notes, your words and your history. A short setup helps Epizen find its way around.'}</p>
    <form className="form" onSubmit={(event) => { event.preventDefault(); void run(); }}>
      <fieldset disabled={busy} className="vault-setup-fields">
        {create && <button type="button" className="quiet-button" onClick={() => setCreate(false)}>Connect existing notes instead</button>}
        {!create && files.length === 0 && <button type="button" className="quiet-button" onClick={() => setCreate(true)}>Create a starter vault here</button>}
        {!create && <fieldset className="settings-group"><legend>Do you already keep daily notes?</legend>
          <div className="vault-setup-choices">
            <label><input type="radio" name="existing" checked={existing === true} onChange={() => setExisting(true)} /> Yes, connect my notes</label>
            <label><input type="radio" name="existing" checked={existing === false} onChange={() => setExisting(false)} /> I’m starting fresh</label>
          </div>
        </fieldset>}
        {!create && existing && <>
          <p className="muted">Choose the folders that hold your daily, weekly and monthly notes. Subfolders are included. Naming patterns below apply only to future notes.</p>
          <PeriodicFolders value={draft} folders={folders} onChange={setDraft} />
          <PeriodicRecognitionFields periodic={draft} value={reading} files={files} texts={texts} onChange={setReading} />
        </>}
        {(create || existing === false) && <div className="vault-setup-preview">
          <h2>Your starting space</h2>
          <div><h3>Calendar / {today().getFullYear()}</h3><p>days · weeks · months</p><small>Each new year gets its own folders.</small></div>
          <div><h3>Library</h3><p>Music · Films · Books · Podcasts · Videos</p><small>Covers stay in _attachments beside their notes.</small></div>
          <p>{create ? 'We’ll create a welcome note, today’s day, week and month, and five empty library shelves.' : 'Your first calendar note creates its folders when you open a date. Existing notes stay untouched.'}</p>
        </div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="quiet-button" disabled={!create && existing === undefined} data-testid="setup-save">{busy ? 'Setting up…' : create ? 'Create my space' : 'Use this setup'}</button>
          <button type="button" className="quiet-button" onClick={() => void run(true)}>Do this later</button>
        </div>
      </fieldset>
    </form>
  </main>;
}
