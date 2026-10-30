import type { MediaEntry } from '../../lib/library';
import { VaultImage } from '../VaultImage';

/** The ten most recently dated library entries, across all kinds. */
export function RecentLibrary({ items, onOpen, onSeeAll }: { items: MediaEntry[]; onOpen: (path: string) => void; onSeeAll: () => void }) {
  const recent = [...items].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(b.title)).slice(0, 10);
  return <section className="card glass shelf" data-testid="recent-library">
    <div className="card-head"><p className="tile-label">Recent library</p><span className="card-note">{items.length} items</span><span className="nav-space" /><button className="shelf-all" onClick={onSeeAll}>See all →</button></div>
    {recent.length === 0 && <p className="shelf-empty">Your library is empty.</p>}
    <ul className="covers">{recent.map((item) => <li key={item.path}><button className="cover-card" onClick={() => onOpen(item.path)} title={item.path} data-testid="cover-card" data-path={item.path}>
      <span className="cover-frame">{item.cover ? <VaultImage path={item.cover} alt={item.title} className="cover-image" /> : <span className="cover-blank">{item.title}</span>}{item.rating !== undefined && <span className="cover-rating">{item.rating}</span>}</span>
      <span className="cover-title">{item.title}</span>{item.maker && <span className="cover-subtitle">{item.maker}</span>}
    </button></li>)}</ul>
  </section>;
}
