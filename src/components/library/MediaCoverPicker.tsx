import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { MediaKind } from '../../lib/library';

export function MediaCoverPicker({ kind, children, onChange }: {
  kind: MediaKind;
  children: ReactNode;
  onChange: (file?: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>();
  const [error, setError] = useState('');
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const choose = (file?: File) => {
    setError('');
    if (file && (!file.size || file.size > 10 * 1024 * 1024)) {
      setError('Choose a nonempty image up to 10 MB.');
      return;
    }
    setPreview(file ? URL.createObjectURL(file) : undefined);
    onChange(file);
  };
  return <div className="media-cover-picker">
    {preview ? <img className={`add-cover is-${kind}`} src={preview} alt="Selected cover" onError={() => {
      choose(); setError('Choose a readable PNG, JPEG, GIF or WebP image.');
    }} /> : children}
    <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp" aria-label="Cover image"
      onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) choose(file); }} />
    <div className="media-cover-actions">
      <button type="button" className="nav-chip" onClick={() => input.current?.click()}>{preview ? 'Change cover…' : 'Choose cover…'}</button>
      {preview && <button type="button" className="quiet-chip" onClick={() => choose()}>Remove</button>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
