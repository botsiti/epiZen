import { useState } from 'react';
import { revealFile, type VaultFile } from '../../lib/api';
import { noteFolder } from '../../lib/links';
import { VaultImage } from '../VaultImage';
export function AttachmentView({ file, root }: { file: VaultFile; root: string }) {
  const [error, setError] = useState<string>();
  return <article className="note"><p className="eyebrow">{noteFolder(file.path)}</p><h1>{file.path.split('/').at(-1)}</h1>{file.kind === 'image' ? <VaultImage path={file.path} alt={file.path.split('/').at(-1)!} className="embed" /> : <p className="muted">This attachment is kept in your vault. Open its folder to use it in another app.</p>}<button type="button" className="quiet-button" onClick={() => { void revealFile(root, file.path).catch((error: unknown) => setError(String(error))); }}>Reveal in Finder</button>{error && <p role="alert">{error}</p>}</article>;
}
