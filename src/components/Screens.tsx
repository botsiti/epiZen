interface HomeProps {
  vaultName: string;
  notes: number;
  folders: number;
  images: number;
}

export function Home({ vaultName, notes, folders, images }: HomeProps) {
  return (
    <section className="screen" data-testid="home">
      <p className="eyebrow">Vault</p>
      <h1 data-testid="vault-name">{vaultName}</h1>
      <p className="muted">
        {notes} notes · {folders} folders · {images} images
      </p>
      <p className="hint">Choose a note on the left.</p>
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

export function NoVault({ message }: { message?: string }) {
  return (
    <main className="screen screen-full" data-testid={message ? 'vault-error' : 'no-vault'}>
      <p className="eyebrow">Epizen</p>
      <h1>{message ? "Couldn't open the vault" : 'No vault open'}</h1>
      {message && <p className="muted">{message}</p>}
      <p className="hint">
        Start Epizen with <code>--vault &lt;folder&gt;</code>, or set <code>EPIZEN_VAULT</code> to a folder of notes.
      </p>
    </main>
  );
}
