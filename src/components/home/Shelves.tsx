import { thisYear } from '../../lib/home';
import { kindOfFolder } from '../../lib/library';
import type { Shelf } from '../../lib/media';
import { order } from '../periodic/effects';
import { VaultImage } from '../VaultImage';

interface Props {
  shelves: Shelf[];
  today: Date;
  onOpen: (path: string) => void;
  /** Opens the shelf's tab in the library. */
  onSeeAll?: (folder: string) => void;
  i: number;
}

/** The rated albums, films, books and podcasts as covers, a glass shelf per kind; an empty one says how to start it. */
export function Shelves({ shelves, today, onOpen, onSeeAll, i }: Props) {
  if (!shelves.length) return null;
  return (
    <div className="shelves">
      {shelves.map((shelf, n) => (
        <ShelfCard key={shelf.folder} shelf={shelf} today={today} onOpen={onOpen} onSeeAll={onSeeAll} i={i + n} />
      ))}
    </div>
  );
}

function ShelfCard({ shelf, today, onOpen, onSeeAll, i }: Omit<Props, 'shelves'> & { shelf: Shelf }) {
  const kind = kindOfFolder(shelf.folder);
  const name = kind?.tab ?? (shelf.folder.split('/').pop() || 'Rated');
  return (
    <section className="card glass rise shelf" style={order(i)} data-testid="shelf" data-folder={shelf.folder}>
      <div className="card-head">
        <p className="tile-label">{name}</p>
        <span className="card-note">
          {shelf.items.length} rated · {thisYear(shelf.items, today)} this year
        </span>
        <span className="nav-space" />
        {kind && onSeeAll && shelf.items.length > 0 && (
          <button type="button" className="shelf-all" onClick={() => onSeeAll(shelf.folder)} data-testid="shelf-see-all">
            See all →
          </button>
        )}
      </div>
      {shelf.items.length === 0 && (
        <p className="shelf-empty" data-testid="shelf-empty">
          Nothing rated yet.{' '}
          {kind && onSeeAll && (
            <button type="button" className="shelf-all" onClick={() => onSeeAll(shelf.folder)}>
              Add the first {kind.one} →
            </button>
          )}
        </p>
      )}
      <ul className="covers">
        {shelf.items.map((item) => (
          <li key={item.path}>
            <button type="button" className="cover-card" onClick={() => onOpen(item.path)} title={item.path} data-testid="cover-card" data-path={item.path}>
              <span className="cover-frame">
                {item.cover ? <VaultImage path={item.cover} alt={item.title} className="cover-image" /> : <span className="cover-blank">{item.title}</span>}
                <span className="cover-rating" data-testid="cover-rating">
                  {item.rating}
                </span>
              </span>
              <span className="cover-title">{item.title}</span>
              {item.subtitle && <span className="cover-subtitle">{item.subtitle}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
