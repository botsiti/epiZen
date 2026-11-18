import { DEFAULT_LIFETIME_YEARS, memento } from '../../lib/home';
import { order } from '../periodic/effects';
import { Bar } from '../periodic/parts';

const thousands = (n: number) => n.toLocaleString('en-US');

export function Memento({ today, birth, years, i }: { today: Date; birth?: Date; years?: number; i: number }) {
  const { spans, life } = memento(today, birth, years);
  const year = spans[0];
  return (
    <section className="card glass rise memento" style={order(i)} data-testid="memento">
      <div className="card-head">
        <p className="tile-label">Memento mori</p>
        <span className="card-note">
          {life ? `${years ?? DEFAULT_LIFETIME_YEARS}-year lifetime` : year && `${year.daysLeft} days left this year`}
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
      {!life && <p className="memento-hint">Add your birth date in Homepage settings to see your lifetime progress.</p>}
    </section>
  );
}
