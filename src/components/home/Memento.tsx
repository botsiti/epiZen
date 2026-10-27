import { useMemo, useState, type PointerEvent } from 'react';
import { addDays, formatDate } from '../../lib/dates';
import { memento, TARGET_AGE, WEEK_COLUMNS } from '../../lib/home';
import { order } from '../periodic/effects';
import { Bar } from '../periodic/parts';

const thousands = (n: number) => n.toLocaleString('en-US');

/** How much of the year, the month and life up to 30 has gone, and what is left of each. */
export function Memento({ today, birth, i }: { today: Date; birth?: Date; i: number }) {
  const { spans, life, weeks } = useMemo(() => memento(today, birth), [today, birth]);
  const year = spans[0];
  return (
    <section className="card glass rise memento" style={order(i)} data-testid="memento">
      <div className="card-head">
        <p className="tile-label">Memento mori</p>
        <span className="card-note">
          {life ? `${thousands(life.daysLeft)} days · ${(life.daysLeft / 365.25).toFixed(2)} y left` : year && `${year.daysLeft} days left this year`}
        </span>
      </div>
      <ul className="memento-bars">
        {spans.map((span) => (
          <li key={span.label} data-span={span.label}>
            <span className="memento-label">{span.label}</span>
            <Bar share={span.share} />
            <span className="memento-share">{(span.share * 100).toFixed(1)}%</span>
            <span className="memento-left">{thousands(span.daysLeft)}d</span>
          </li>
        ))}
      </ul>
      {weeks && birth ? (
        <Weeks birth={birth} lived={weeks.lived} current={weeks.current} cells={weeks.cells} />
      ) : (
        <p className="memento-hint">Add your birth date in Settings to count the weeks.</p>
      )}
    </section>
  );
}

const CELL = 3.4;
const GAP = 1.25;
const STEP = CELL + GAP;
const GUTTER = 15;

/**
 * Life up to 30 in weeks, a row per year: lived, the one being lived, and the ones ahead. Shut
 * until asked for; it is tall, and the bars above are the daily glance.
 */
function Weeks({ birth, lived, current, cells }: { birth: Date; lived: number; current: number; cells: number }) {
  const [open, setOpen] = useState(false);
  const [pointed, setPointed] = useState<number>();
  const rows = cells / WEEK_COLUMNS;
  const width = GUTTER + WEEK_COLUMNS * STEP - GAP;
  const height = rows * STEP - GAP;
  const point = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * width;
    const y = ((event.clientY - box.top) / box.height) * height;
    const column = Math.floor((x - GUTTER) / STEP);
    const row = Math.floor(y / STEP);
    setPointed(column >= 0 && column < WEEK_COLUMNS && row >= 0 && row < rows ? row * WEEK_COLUMNS + column : undefined);
  };
  // A cell is a 52nd of a personal year, so its days come from where it falls in the 30 years.
  const total = new Date(birth.getFullYear() + TARGET_AGE, birth.getMonth(), birth.getDate()).getTime() - birth.getTime();
  const cellStart = (index: number) => {
    const at = new Date(birth.getTime() + (index / cells) * total);
    return new Date(at.getFullYear(), at.getMonth(), at.getDate());
  };
  // Drawn once: pointing at a week re-renders the caption, not the 1,560 cells.
  const grid = useMemo(
    () => (
      <>
        {Array.from({ length: rows / 5 }, (_, n) => (
          <text key={n} className="weeks-age" x={GUTTER - 4.5} y={n * 5 * STEP + CELL * 0.95} textAnchor="end">
            {n * 5}
          </text>
        ))}
        {Array.from({ length: cells }, (_, index) => (
          <rect
            key={index}
            className={index < lived ? 'week-cell is-lived' : index === current ? 'week-cell is-now' : 'week-cell'}
            x={GUTTER + (index % WEEK_COLUMNS) * STEP}
            y={Math.floor(index / WEEK_COLUMNS) * STEP}
            width={CELL}
            height={CELL}
            rx={0.85}
          />
        ))}
      </>
    ),
    [rows, cells, lived, current],
  );
  return (
    <div className="weeks">
      <button type="button" className="weeks-toggle" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="weeks-toggle">
        <span className="weeks-chevron" aria-hidden="true">
          ›
        </span>
        <span className="tile-label">Till {TARGET_AGE} in weeks</span>
        <span className="card-note">
          {thousands(lived)} of {thousands(cells)} weeks spent
        </span>
      </button>
      {open && (
        <>
          <svg className="weeks-grid" viewBox={`0 0 ${width.toFixed(2)} ${height.toFixed(2)}`} onPointerMove={point} onPointerLeave={() => setPointed(undefined)} role="img" aria-label={`${lived} of ${cells} weeks spent`} data-testid="weeks-grid">
            {grid}
          </svg>
          <p className="weeks-caption">
            {pointed === undefined
              ? 'Point at a week to see its dates.'
              : `Age ${Math.floor(pointed / WEEK_COLUMNS)}, week ${(pointed % WEEK_COLUMNS) + 1}: ${formatDate(cellStart(pointed), 'D MMM YYYY')} – ${formatDate(addDays(cellStart(pointed + 1), -1), 'D MMM YYYY')}${pointed < lived ? ', lived' : pointed === current ? ', now' : ''}`}
          </p>
        </>
      )}
    </div>
  );
}
