import { useMemo } from 'react';
import { formatDate } from '../lib/dates';
import { formatMinutes, parseDay } from '../lib/day';
import type { Shelf } from '../lib/media';
import { VaultImage } from './VaultImage';

interface Props {
  vaultName: string;
  stats: { notes: number; folders: number; images: number };
  /** Today's daily note: where it is (or would be) and its text if it exists. */
  today: { date: Date; name: string; path?: string; text?: string };
  shelves: Shelf[];
  onOpen: (path: string) => void;
  /** Opens today's note, or creates it from its template. */
  onToday: () => void;
}

/** The vault at a glance: today's note on top, then every rated album, film and video as covers. */
export function Home({ vaultName, stats, today, shelves, onOpen, onToday }: Props) {
  return (
    <section className="home" data-testid="home">
      <p className="eyebrow">Vault</p>
      <h1 data-testid="vault-name">{vaultName}</h1>
      <p className="muted">
        {stats.notes} notes · {stats.folders} folders · {stats.images} images
      </p>
      <Today today={today} onToday={onToday} />
      {shelves.map((shelf) => (
        <ShelfRow key={shelf.folder} shelf={shelf} onOpen={onOpen} />
      ))}
    </section>
  );
}

function Today({ today, onToday }: { today: Props['today']; onToday: () => void }) {
  const day = useMemo(() => (today.text === undefined ? undefined : parseDay(today.text)), [today.text]);
  const summary = day?.totals;
  const mood = day?.numbers.mood || undefined;
  return (
    <div className="today" data-testid="today">
      <div>
        <p className="eyebrow">Today</p>
        <p className="today-date">{formatDate(today.date, 'dddd, D MMMM')}</p>
        <p className="today-summary">
          {summary
            ? [
                summary.tasks ? `${summary.tasksDone} of ${summary.tasks} tasks done` : 'No tasks yet',
                summary.logged ? `${formatMinutes(summary.logged)} logged` : '',
                mood === undefined ? '' : `mood ${mood}`,
              ]
                .filter(Boolean)
                .join(' · ')
            : `No note yet. ${today.name} starts from its template.`}
        </p>
      </div>
      <button type="button" className="quiet-button" onClick={onToday} data-testid={today.path ? 'today-open' : 'today-create'}>
        {today.path ? `Open ${today.name}` : 'Create today’s note'}
      </button>
    </div>
  );
}

function ShelfRow({ shelf, onOpen }: { shelf: Shelf; onOpen: (path: string) => void }) {
  const name = shelf.folder.split('/').pop() || 'Rated';
  return (
    <section className="shelf" data-testid="shelf" data-folder={shelf.folder}>
      <p className="eyebrow">
        {name} · {shelf.items.length}
      </p>
      <ul className="covers">
        {shelf.items.map((item) => (
          <li key={item.path}>
            <button type="button" className="cover-card" onClick={() => onOpen(item.path)} title={item.path} data-testid="cover-card" data-path={item.path}>
              {item.cover ? (
                <VaultImage path={item.cover} alt={item.title} className="cover-image" />
              ) : (
                <span className="cover-blank">{item.title}</span>
              )}
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
