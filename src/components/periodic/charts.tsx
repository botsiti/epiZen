import type { CSSProperties, ReactNode } from 'react';

const TAU = Math.PI * 2;

/** A ring of coloured arcs, one per share, each sweeping in after the one before; `center` sits inside. */
export function Donut({ parts, size = 220, width = 18, center }: { parts: { color: string; value: number; label: string }[]; size?: number; width?: number; center?: ReactNode }) {
  const radius = (size - width) / 2;
  const length = TAU * radius;
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  // A hair of space between arcs, unless one arc is the whole ring.
  const gap = parts.length > 1 ? Math.min(4, length / parts.length / 4) : 0;
  let offset = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={parts.map((part) => part.label).join(', ')}>
        <circle className="donut-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={width} />
        {total > 0 &&
          parts.map((part, i) => {
            const arc = Math.max(0, (part.value / total) * length - gap);
            const style = { '--c': `${length}px`, '--i': i, stroke: part.color } as CSSProperties;
            const circle = (
              <circle
                key={part.label}
                className="donut-arc"
                cx={size / 2}
                cy={size / 2}
                r={radius}
                strokeWidth={width}
                strokeDasharray={`${arc} ${length - arc}`}
                strokeDashoffset={-offset}
                style={style}
              />
            );
            offset += (part.value / total) * length;
            return circle;
          })}
      </svg>
      {center && <div className="donut-center">{center}</div>}
    </div>
  );
}

/** One share of a whole as a ring, like a day's plan done. */
export function Ring({ value, max, color = 'var(--accent)', size = 56, width = 5, children }: { value: number; max: number; color?: string; size?: number; width?: number; children?: ReactNode }) {
  const radius = (size - width) / 2;
  const length = TAU * radius;
  const arc = Math.max(0, Math.min(1, max ? value / max : 0)) * length;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="donut-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={width} />
        <circle
          className="donut-arc"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={width}
          strokeDasharray={`${arc} ${length - arc}`}
          style={{ '--c': `${length}px`, stroke: color } as CSSProperties}
        />
      </svg>
      {children !== undefined && <div className="ring-center">{children}</div>}
    </div>
  );
}

/** A value on a short scale as a row of segments: 4 of 5, lit in the metric's colour. */
export function Segments({ value, max, color, onPick, label }: { value?: number; max: number; color: string; onPick?: (value: number) => void; label: string }) {
  const count = max <= 10 ? max : 10;
  const lit = value === undefined ? 0 : max <= 10 ? Math.round(value) : Math.round((value / max) * 10);
  return (
    <div className="segments" style={{ '--tone': color } as CSSProperties} role={onPick ? 'radiogroup' : undefined} aria-label={label}>
      {Array.from({ length: count }, (_, i) =>
        onPick ? (
          <button
            key={i}
            type="button"
            className={i < lit ? 'segment is-lit' : 'segment'}
            style={{ '--i': i } as CSSProperties}
            role="radio"
            aria-checked={i + 1 === lit}
            aria-label={`${label} ${i + 1}`}
            title={`${i + 1}`}
            onClick={() => onPick(i + 1)}
            data-testid="segment"
            data-value={i + 1}
          />
        ) : (
          <span key={i} className={i < lit ? 'segment is-lit' : 'segment'} style={{ '--i': i } as CSSProperties} />
        ),
      )}
    </div>
  );
}

export interface Series {
  label: string;
  color: string;
  values: (number | undefined)[];
}

/**
 * Lines over days, drawn in from the left. A day without a value breaks the line; a lone value is a dot.
 * `max` is the top of the scale; the x labels sit under their days.
 */
export function LineChart({ series, max, labels, height = 180 }: { series: Series[]; max: number; labels: string[]; height?: number }) {
  const width = 640;
  const pad = { top: 12, right: 12, bottom: 24, left: 28 };
  const count = Math.max(1, labels.length);
  const x = (i: number) => pad.left + (count === 1 ? 0.5 : i / (count - 1)) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (1 - Math.min(1, Math.max(0, value / max))) * (height - pad.top - pad.bottom);
  const ticks = [0, max / 2, max];
  // Every few labels, so a month's thirty don't crowd.
  const every = Math.ceil(count / 10);
  return (
    <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={series.map((s) => s.label).join(', ')}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line className="chart-grid" x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} />
          <text className="chart-tick" x={pad.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">
            {Math.round(tick * 10) / 10}
          </text>
        </g>
      ))}
      {labels.map((label, i) =>
        i % every === 0 || i === count - 1 ? (
          <text key={i} className="chart-tick" x={x(i)} y={height - 6} textAnchor="middle">
            {label}
          </text>
        ) : null,
      )}
      {series.map((line, n) => {
        const runs: string[] = [];
        let run = '';
        line.values.forEach((value, i) => {
          if (value === undefined) {
            if (run) runs.push(run);
            run = '';
            return;
          }
          run += `${run ? 'L' : 'M'}${x(i).toFixed(1)},${y(value).toFixed(1)}`;
        });
        if (run) runs.push(run);
        return (
          <g key={line.label} style={{ '--i': n, color: line.color } as CSSProperties}>
            {runs.map((d) => (
              <path key={d} className="chart-line" d={d} pathLength={1} />
            ))}
            {line.values.map((value, i) =>
              value === undefined ? null : <circle key={i} className="chart-dot" cx={x(i)} cy={y(value)} r={2.5} />,
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** A small line under a number: its values across the days, no axes. */
export function Sparkline({ values, max, color }: { values: (number | undefined)[]; max: number; color: string }) {
  const width = 120;
  const height = 28;
  const points = values.map((value, i) => (value === undefined ? undefined : ([(i / Math.max(1, values.length - 1)) * width, height - 2 - (Math.min(value, max) / max) * (height - 4)] as const)));
  let d = '';
  points.forEach((point, i) => {
    if (!point) return;
    d += `${points[i - 1] ? 'L' : 'M'}${point[0].toFixed(1)},${point[1].toFixed(1)}`;
  });
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" style={{ color }}>
      {d && <path className="chart-line" d={d} pathLength={1} />}
    </svg>
  );
}
