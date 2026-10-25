/** Text the editor couldn't save after it was closed, kept on screen so it can be copied. */
export function Unsaved({ path, text, message }: { path: string; text: string; message: string }) {
  return (
    <section className="screen" data-testid="unsaved">
      <p className="eyebrow">Not saved</p>
      <h1>{path.replace(/\.md$/i, '')}</h1>
      <p className="muted">
        Epizen couldn't save your last edits: {message}. The note wasn't changed. Your text is below; copy it before
        you go.
      </p>
      <pre className="unsaved-text">{text}</pre>
    </section>
  );
}

export function Problem({ title, message, onBack }: { title: string; message: string; onBack?: () => void }) {
  return (
    <section className="screen" data-testid="problem">
      <p className="eyebrow">Something went wrong</p>
      <h1>{title}</h1>
      <p className="muted">{message}</p>
      {onBack && (
        <button type="button" className="quiet-button" onClick={onBack}>
          Back
        </button>
      )}
    </section>
  );
}

export function MissingNote({ target, onBack }: { target: string; onBack?: () => void }) {
  return (
    <section className="screen" data-testid="missing-note">
      <p className="eyebrow">Not in this vault</p>
      <h1>{target}</h1>
      <p className="muted">No note has this name yet. Nothing was created.</p>
      {onBack && (
        <button type="button" className="quiet-button" onClick={onBack}>
          Back
        </button>
      )}
    </section>
  );
}

interface NoVaultProps {
  message?: string;
  onOpenFolder: () => void;
  /** Why the last folder the user picked couldn't be opened. */
  folderError?: string;
}

export function NoVault({ message, onOpenFolder, folderError }: NoVaultProps) {
  return (
    <main className="screen screen-full" data-testid={message ? 'vault-error' : 'no-vault'}>
      <p className="eyebrow">Epizen</p>
      <h1>{message ? "Couldn't open the vault" : 'No vault open'}</h1>
      {message && <p className="muted">{message}</p>}
      <button type="button" className="quiet-button" onClick={onOpenFolder} data-testid="open-folder">
        Open a folder of notes…
      </button>
      {folderError && <p className="muted">{folderError}</p>}
      <p className="hint">
        Epizen opens it again next time. You can also start it with <code>--vault &lt;folder&gt;</code>.
      </p>
    </main>
  );
}
