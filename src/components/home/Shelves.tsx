import { thisYear } from '../../lib/home';
import type { Shelf } from '../../lib/media';
import { order } from '../periodic/effects';
import { VaultImage } from '../VaultImage';

/** Every rated album, film and video as covers, a glass shelf per folder. */
export function Shelves({ shelves, today, onOpen, i }: { shelves: Shelf[]; today: Date; onOpen: (path: string) => void; i: number }) {
  if (!shelves.length) return null;
  return (
    <div className="shelves">
      {shelves.map((shelf, n) => (
        <ShelfCard key={shelf.folder} shelf={shelf} today={today} onOpen={onOpen} i={i + n} />
      ))}
    </div>
  );
}

function ShelfCard({ shelf, today, onOpen, i }: { shelf: Shelf; today: Date; onOpen: (path: string) => void; i: number }) {
  const name = shelf.folder.split('/').pop() || 'Rated';
  return (
    <section className="card glass rise shelf" style={order(i)} data-testid="shelf" data-folder={shelf.folder}>
      <div className="card-head">
        <p className="tile-label">{name}</p>
        <span className="card-note">
          {shelf.items.length} rated · {thisYear(shelf.items, today)} this year
        </span>
      </div>
      <ul className="covers">
        {shelf.items.map((item) => (
          <li key={item.path}>
            <button type="button" className="cover-card" onClick={() => onOpen(item.path)} title={item.path} data-testid="cover-card" data-path={item.path}>
              {item.cover ? <VaultImage path={item.cover} alt={item.title} className="cover-image" /> : <span className="cover-blank">{item.title}</span>}
              <span className="cover-caption">
                <span className="cover-title">{item.title}</span>
                <span className="cover-rating" data-testid="cover-rating">
                  {item.rating}
                </span>
              </span>
              {item.subtitle && <span className="cover-subtitle">{item.subtitle}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
