import { useState, type FormEvent } from 'react';
import { noteNameProblem } from '../lib/text';

interface Props {
  folders: string[];
  /** Where the note goes unless the user picks another folder. `''` is the vault's top level. */
  folder: string;
  onCreate: (path: string) => Promise<void>;
}

/** Names a new, empty note. Creating it never replaces a file that has the name already. */
export function NewNote({ folders, folder, onCreate }: Props) {
  const [name, setName] = useState('');
  const [where, setWhere] = useState(folder);
  const [error, setError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = noteNameProblem(name);
    if (problem) {
      setError(problem);
      return;
    }
    const file = `${name.trim().normalize('NFC')}.md`;
    onCreate(where ? `${where}/${file}` : file).catch((err: unknown) => setError(String(err)));
  };

  return (
    <section className="screen" data-testid="new-note">
      <p className="eyebrow">New note</p>
      <h1>Name the note</h1>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Untitled" autoFocus data-testid="new-note-name" />
        </label>
        <label className="field">
          <span>Folder</span>
          <select value={where} onChange={(event) => setWhere(event.target.value)} data-testid="new-note-folder">
            <option value="">Top of the vault</option>
            {folders.map((path) => (
              <option key={path} value={path}>
                {path}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="form-error" data-testid="new-note-error">
            {error}
          </p>
        )}
        <div>
          <button type="submit" className="quiet-button" data-testid="new-note-create">
            Create
          </button>
        </div>
      </form>
    </section>
  );
}
