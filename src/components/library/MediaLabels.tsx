import { useState } from 'react';
import type { ListChange } from '../../lib/mediaProperties';
import { LibraryDialog } from './LibraryDialog';
import { GenreSuggestions } from './GenreSuggestions';

export function MediaLabels({ label, property, values, onSave, suggestions = [] }: { suggestions?: string[]; label: string; property: string; values: string[]; onSave: (changes: ListChange[]) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  return <div className="media-labels" data-testid={`media-${label.toLowerCase()}`}>
    <span className="tile-label">{label}</span><div className="media-genres">{values.map((value) => <span key={value} className="media-genre">{value}</span>)}<button type="button" className="nav-chip" onClick={() => setEditing(true)} aria-label={`Edit ${label.toLowerCase()}`}>+</button></div>
    {editing && <LabelEditor suggestions={suggestions} label={label} property={property} values={values} onSave={onSave} onClose={() => setEditing(false)} />}
  </div>;
}
function LabelEditor({ label, property, values, onSave, onClose, suggestions }: { suggestions: string[]; label: string; property: string; values: string[]; onSave: (changes: ListChange[]) => Promise<void>; onClose: () => void }) {
  const [before] = useState(values);
  const [draft, setDraft] = useState(values);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const withWord = () => [...new Set([...draft, ...word.split(',').map((value) => value.trim()).filter(Boolean)])];
  const save = async () => { setBusy(true); setError(''); try { await onSave([{ key: property, before, after: withWord() }]); onClose(); } catch (err) { setError(String(err)); setBusy(false); } };
  return <LibraryDialog title={`Edit ${label.toLowerCase()}`} onClose={() => { if (!busy) onClose(); }}><div className="add-body">
    <div className="media-genres">{draft.map((value) => <button type="button" key={value} className="media-genre is-removable" disabled={busy} onClick={() => setDraft(draft.filter((item) => item !== value))} aria-label={`Remove ${value}`}>{value} ×</button>)}</div>
    <form onSubmit={(event) => { event.preventDefault(); setDraft(withWord()); setWord(''); }}><label className="field"><span>Add {label.toLowerCase()}</span><input autoFocus value={word} disabled={busy} onChange={(event) => setWord(event.target.value)} placeholder="Type a value and press Enter" /></label>{!busy && <GenreSuggestions query={word} selected={draft} suggestions={suggestions} onSelect={(value) => { setDraft([...draft, value]); setWord(''); }} />}</form>
    {error && <p className="form-error" role="alert">{error}</p>}<div className="add-actions"><button type="button" className="nav-chip" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button></div>
  </div></LibraryDialog>;
}
