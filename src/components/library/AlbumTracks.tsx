import { useEffect, useRef, useState } from 'react';
import { lookupJson } from '../../lib/api';
import { albumEditions, albumPages, albumSearchUrl, albumTracksUrl, type AlbumPage, type TrackEdition } from '../../lib/albumTracks';
import type { ListChange } from '../../lib/mediaProperties';
import { LibraryDialog } from './LibraryDialog';

interface Props { title: string; maker?: string; tracks: string[]; favorites: string[]; favoriteKey: string; onSave: (changes: ListChange[]) => Promise<void> }
export function AlbumTracks(props: Props) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tracks = props.tracks.length ? props.tracks : props.favorites;
  const toggle = async (track: string) => {
    setBusy(true); setError('');
    const after = props.favorites.includes(track) ? props.favorites.filter((value) => value !== track) : [...props.favorites, track];
    try { await props.onSave([{ key: props.favoriteKey, before: props.favorites, after }]); }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  };
  return <section className="card glass media-tracks" data-testid="media-tracks">
    <div className="library-section-top"><div><p className="tile-label">Favorite tracks</p><p className="muted">Star the songs you want to remember.</p></div><button type="button" className="nav-chip" onClick={() => setPicking(true)} data-testid="find-tracks">Choose from Wikipedia</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <ol>{tracks.map((track, i) => <li key={track}><span className="media-track-number">{String(i + 1).padStart(2, '0')}</span><span>{/^\d+$/.test(track) ? `Track ${track}` : track}</span><button type="button" className="track-star" disabled={busy} aria-label={`Favorite ${track}`} aria-pressed={props.favorites.includes(track)} onClick={() => void toggle(track)}>{props.favorites.includes(track) ? '★' : '☆'}</button></li>)}</ol>
    {picking && <TrackPicker {...props} onClose={() => setPicking(false)} />}
  </section>;
}
function TrackPicker({ title, maker, tracks, favorites, favoriteKey, onSave, onClose }: Props & { onClose: () => void }) {
  const [beforeTracks] = useState(tracks), [beforeFavorites] = useState(favorites);
  const [query, setQuery] = useState([title, maker, 'album'].filter(Boolean).join(' '));
  const [pages, setPages] = useState<AlbumPage[]>();
  const [page, setPage] = useState<AlbumPage>();
  const [editions, setEditions] = useState<TrackEdition[]>([]);
  const [edition, setEdition] = useState(0);
  const [selected, setSelected] = useState(favorites);
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);
  const search = async () => {
    const current = ++generation.current; setBusy(true); setError(''); setPage(undefined); setPages(undefined); setEditions([]);
    try { const found = albumPages(await lookupJson(albumSearchUrl(query))); if (current === generation.current) setPages(found); }
    catch (err) { if (current === generation.current) setError(String(err)); }
    finally { if (current === generation.current) setBusy(false); }
  };
  const pick = async (next: AlbumPage) => {
    const current = ++generation.current; setBusy(true); setError(''); setPage(next); setEditions([]);
    try {
      const found = albumEditions(await lookupJson(albumTracksUrl(next.id)));
      if (current === generation.current) { setEditions(found); setEdition(0); setSelected(beforeFavorites.map((value) => /^\d+$/.test(value) ? found[0]?.tracks[Number(value) - 1] ?? value : value)); }
    } catch (err) { if (current === generation.current) setError(String(err)); }
    finally { if (current === generation.current) setBusy(false); }
  };
  const chosen = editions[edition]?.tracks ?? [];
  const save = async () => {
    setSaving(true); setError('');
    try { await onSave([{ key: 'tracks', before: beforeTracks, after: [...new Set([...chosen, ...selected])] }, { key: favoriteKey, before: beforeFavorites, after: selected }]); onClose(); }
    catch (err) { setError(String(err)); setSaving(false); }
  };
  return <LibraryDialog title="Choose favorite tracks" onClose={() => { if (!saving) onClose(); }} className="track-picker" footer={chosen.length > 0 && <div className="add-actions"><span className="muted">{selected.length} favorites</span><button type="button" className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save favorites'}</button></div>}><div className="add-body">
    <form className="track-search" onSubmit={(event) => { event.preventDefault(); void search(); }}><label className="field"><span>Album on Wikipedia</span><input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus disabled={saving} /></label><button type="submit" className="nav-chip" disabled={busy || saving || !query.trim()}>Search</button></form>
    {busy && <p className="add-hint" role="status">Reading Wikipedia…</p>}{error && <p className="form-error" role="alert">{error}</p>}
    {!page && pages && <ul className="add-results">{pages.map((found) => <li key={found.id}><button type="button" className="add-result" disabled={busy || saving} onClick={() => void pick(found)}><span className="add-result-text"><span className="add-result-title">{found.title}</span><span className="add-result-meta">{found.description}</span></span></button></li>)}</ul>}
    {!busy && pages?.length === 0 && <p className="muted">No pages found. Try the album title or artist.</p>}
    {page && <><div className="library-section-top"><p className="kicker">{page.title} · Wikipedia</p><button type="button" className="nav-chip" disabled={busy || saving} onClick={() => { setPage(undefined); setEditions([]); }}>← Results</button></div>
      {!busy && !editions.length && <p className="muted">No track listing was found on this page. Try another album page.</p>}
      {editions.length > 1 && <label className="field"><span>Track listing</span><select value={edition} disabled={saving} onChange={(event) => setEdition(Number(event.target.value))}>{editions.map((value, i) => <option key={i} value={i}>{value.title}</option>)}</select></label>}
      <ol className="track-choices">{chosen.map((track, i) => <li key={track}><span className="media-track-number">{String(i + 1).padStart(2, '0')}</span><span>{track}</span><button type="button" className="track-star" disabled={saving} aria-label={`Favorite ${track}`} aria-pressed={selected.includes(track)} onClick={() => setSelected(selected.includes(track) ? selected.filter((value) => value !== track) : [...selected, track])}>{selected.includes(track) ? '★' : '☆'}</button></li>)}</ol>
      {selected.filter((value) => !chosen.includes(value)).length > 0 && <div className="media-genres">{selected.filter((value) => !chosen.includes(value)).map((value) => <button key={value} type="button" className="media-genre" disabled={saving} onClick={() => setSelected(selected.filter((item) => item !== value))}>{value} ★ ×</button>)}</div>}
    </>}
  </div></LibraryDialog>;
}
