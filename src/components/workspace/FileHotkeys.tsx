import { useState } from 'react';
import { DEFAULT_FILE_KEYS, FILE_COMMANDS, fileChord, fileKeyProblem, type FileCommand, type FileKeys } from './fileShortcuts';

export function FileHotkeys({ value, commands, onSave }: { value: FileKeys; commands: readonly typeof FILE_COMMANDS[number][]; onSave?: (keys: FileKeys) => Promise<void> }) {
  const [recording, setRecording] = useState<FileCommand>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const save = async (id: FileCommand, chords: string[]) => {
    if (!onSave || busy) return;
    setBusy(true); setRecording(undefined); setProblem('');
    try { await onSave({ ...value, [id]: chords }); }
    catch (error) { setProblem(`Could not save shortcut. ${String(error)}`); }
    finally { setBusy(false); }
  };
  if (!commands.length) return null;
  return <section><h3>Files</h3><dl>{commands.map(({ id, label }) => <div className="workspace-shortcut" key={id}><dt>{label}</dt><dd className="file-hotkey-actions">
    {!value[id].length && <span>Unassigned</span>}
    {value[id].map((chord) => <kbd key={chord}>{chord}{onSave && <button type="button" disabled={busy} aria-label={`Remove ${chord} from ${label}`} onClick={() => void save(id, value[id].filter((key) => key !== chord))}>×</button>}</kbd>)}
    {onSave && <button type="button" disabled={busy} aria-label={`Add shortcut for ${label}`} data-recording-shortcut={recording === id} onClick={() => { setRecording(id); setProblem(''); }} onBlur={() => setRecording(undefined)} onKeyDown={(event) => {
      if (recording !== id || event.key === 'Tab') return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Escape') { setRecording(undefined); setProblem(''); return; }
      if (event.repeat || ['Shift', 'Meta', 'Control', 'Alt'].includes(event.key)) return;
      const chord = fileChord(event.nativeEvent);
      const conflict = chord ? fileKeyProblem(chord, value) : 'Use Command or Control with a letter.';
      if (conflict) setProblem(conflict);
      else if (chord) void save(id, [...value[id], chord]);
    }}>{recording === id ? 'Press keys…' : '+'}</button>}
    {onSave && value[id].join() !== DEFAULT_FILE_KEYS[id].join() && <button type="button" disabled={busy} aria-label={`Restore default for ${label}`} onClick={() => {
      const other = { ...value, [id]: [] };
      const conflict = DEFAULT_FILE_KEYS[id].map((chord) => fileKeyProblem(chord, other)).find(Boolean);
      if (conflict) setProblem(conflict); else void save(id, DEFAULT_FILE_KEYS[id]);
    }}>↺</button>}
  </dd></div>)}</dl>{problem && <p role="alert">{problem}</p>}</section>;
}
