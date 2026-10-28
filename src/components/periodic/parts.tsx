import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { Category } from '../../lib/categories';
import { formatMinutes } from '../../lib/day';
import type { MediaItem } from '../../lib/media';
import { VaultImage } from '../VaultImage';
import { order } from './effects';

/** The top of a page: a small kicker, the period's name in the display face, a line under it, and its way around. */
export function Hero({ name, kicker, title, children, aside, nav }: { name: string; kicker: string; title: string; children?: ReactNode; aside?: ReactNode; nav: ReactNode }) {
  return (
    <header className="hero glass" data-testid="hero">
      <div className="hero-aurora" aria-hidden="true" />
      <div className="hero-main">
        <p className="kicker">
          {kicker}
          <span className="hero-name" data-testid="note-title" title="The note's name">
            {name}
          </span>
        </p>
        <h1 className="hero-title" data-testid="hero-title">
          {title}
        </h1>
        {children}
      </div>
      {aside && <div className="hero-aside">{aside}</div>}
      <nav className="hero-nav">{nav}</nav>
    </header>
  );
}

/** A way to the next or previous period, or up to the week or month. Faint when that note doesn't exist yet. */
export function NavButton({ label, onClick, exists, testId, title }: { label: string; onClick: () => void; exists: boolean; testId: string; title: string }) {
  return (
    <button
      type="button"
      className={exists ? 'nav-chip' : 'nav-chip is-missing'}
      onClick={onClick}
      title={exists ? title : `${title}: no note yet; opening it creates it from its template`}
      data-testid={testId}
    >
      {label}
    </button>
  );
}

/** Word tabs with a line that slides under the chosen one. */
export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: readonly T[]; active: T; onChange: (tab: T) => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const button = strip.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!button || !line.current) return;
    line.current.style.transform = `translateX(${button.offsetLeft}px)`;
    line.current.style.width = `${button.offsetWidth}px`;
  }, [active, tabs]);
  return (
    <div className="tabs" role="tablist" ref={strip}>
      {tabs.map((tab) => (
        <button key={tab} type="button" role="tab" aria-selected={tab === active} className="tab" onClick={() => onChange(tab)} data-testid="tab" data-tab={tab}>
          {tab}
        </button>
      ))}
      <span className="tab-line" ref={line} aria-hidden="true" />
    </div>
  );
}

/** A glass card with a label, rising into place in its turn. */
export function Tile({ label, children, meta, i = 0, className, testId, tone }: { label: string; children: ReactNode; meta?: ReactNode; i?: number; className?: string; testId?: string; tone?: string }) {
  return (
    <div className={`tile glass rise${className ? ` ${className}` : ''}`} style={{ ...order(i), ...(tone ? ({ '--tone': tone } as CSSProperties) : {}) }} data-testid={testId}>
      <p className="tile-label">{label}</p>
      <div className="tile-value">{children}</div>
      {meta !== undefined && <div className="tile-meta">{meta}</div>}
    </div>
  );
}

/** A section of a page: a label, an optional faint note, and its content. */
export function Section({ title, note, children, i = 0, testId }: { title: string; note?: ReactNode; children: ReactNode; i?: number; testId?: string }) {
  return (
    <section className="section rise" style={order(i)} data-testid={testId}>
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        {note && <span className="section-note">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/** A thin bar filled to a share, in a colour. */
export function Bar({ share, color = 'var(--accent)' }: { share: number; color?: string }) {
  return (
    <span className="bar" aria-hidden="true">
      <span style={{ width: `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`, background: color }} />
    </span>
  );
}

/** Minutes by category: a coloured bar each, longest first, with the time and its share. */
export function CategoryBars({ rows }: { rows: [Category, number][] }) {
  const total = rows.reduce((sum, [, minutes]) => sum + minutes, 0);
  const most = Math.max(1, ...rows.map(([, minutes]) => minutes));
  return (
    <ul className="category-bars" data-testid="category-bars">
      {rows.map(([meta, minutes], i) => (
        <li key={meta.name} className="rise" style={order(i)}>
          <span className="chip-dot" style={{ background: meta.color }} />
          <span className="category-name">{meta.name}</span>
          <span className="category-bar" aria-hidden="true">
            <span style={{ width: `${(minutes / most) * 100}%`, background: meta.color }} />
          </span>
          <span className="category-time">
            {formatMinutes(minutes)}
            <span className="faint"> {total ? Math.round((minutes / total) * 100) : 0}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Habits down the side, days across: a lit cell for each tick, a dim one for a miss, a dot where there was no note. */
export function HabitGrid({ habits, labels, colors }: { habits: { name: string; marks: (boolean | null)[] }[]; labels: string[]; colors: string[] }) {
  const columns = labels.length;
  return (
    <div className="habit-grid" style={{ '--days': columns } as CSSProperties} data-testid="habit-grid">
      <span />
      {labels.map((label, i) => (
        <span key={i} className="habit-day">
          {label}
        </span>
      ))}
      {habits.map((habit, h) => (
        <div className="habit-row" key={habit.name} style={{ display: 'contents' }}>
          <span className="habit-name" title={habit.name}>
            {habit.name}
          </span>
          {habit.marks.map((mark, d) => (
            <span
              key={d}
              className={mark === null ? 'habit-cell is-none' : mark ? 'habit-cell is-done' : 'habit-cell'}
              style={{ '--tone': colors[h], '--i': h * 2 + d } as CSSProperties}
              title={`${habit.name}, ${labels[d]}: ${mark === null ? 'no note' : mark ? 'done' : 'missed'}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Album and film covers, with their rating. */
export function Covers({ items, onOpen }: { items: { item?: MediaItem; title: string; kind: string }[]; onOpen: (path: string) => void }) {
  return (
    <ul className="mini-covers" data-testid="mini-covers">
      {items.map(({ item, title, kind }, i) => (
        <li key={`${kind}-${title}-${i}`} className="rise" style={order(i)}>
          <button type="button" className="mini-cover" disabled={!item} onClick={() => item && onOpen(item.path)} title={`${kind}: ${title}`}>
            {item?.cover ? <VaultImage path={item.cover} alt={title} className="mini-cover-image" /> : <span className="mini-cover-blank">{title}</span>}
            <span className="mini-cover-caption">
              <span className="mini-cover-title">{title}</span>
              {item && <span className="mini-cover-rating">{item.rating}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
