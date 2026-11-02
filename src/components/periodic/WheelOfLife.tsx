import { useEffect, useRef, useState } from 'react';
import { SPHERES } from '../../lib/categories';
import { still } from './effects';

const point = (index: number, radius: number) => {
  const angle = index * Math.PI / 4 - Math.PI / 2;
  return [220 + Math.cos(angle) * radius, 205 + Math.sin(angle) * radius] as const;
};
const polygon = (radii: number[]) => radii.map((radius, i) => point(i, radius).join(',')).join(' ');
const labels = ['Career', 'Health', 'Growth', 'Finance', 'Spiritual', 'Love', 'Recreation', 'Social'];

/** Scores are satisfaction, not an averaged judgement of the person's life. */
export function WheelOfLife({ ratings, selected, onSelect }: { ratings: string[]; selected: string; onSelect: (name: string) => void }) {
  const values = useWheelMotion(ratings);
  const rated = ratings.filter((rating) => rating !== '').length;
  return <div className="life-wheel">
    <svg viewBox="0 0 440 410" role="group" aria-label="Wheel of Life: monthly ratings">
      {[2, 4, 6, 8, 10].map((score) => <polygon key={score} points={polygon(SPHERES.map(() => score * 14))} className="life-wheel-grid" />)}
      {SPHERES.map((item, i) => { const [x, y] = point(i, 140); return <line key={item.name} x1="220" y1="205" x2={x} y2={y} className="life-wheel-axis" />; })}
      {rated > 0 && <polygon points={polygon(values.map((rating) => rating * 14))} className="life-wheel-shape" />}
      {[2, 6, 10].map((score) => <text key={score} x="225" y={205 - score * 14 + 12} className="life-wheel-scale">{score}</text>)}
      {SPHERES.map((item, i) => {
        const [x, y] = point(i, 177);
        const [dx, dy] = point(i, (values[i] ?? 0) * 14);
        const active = item.name === selected;
        return <g key={item.name} role="button" tabIndex={0} aria-label={`Select ${item.name}, ${ratings[i] === '' ? 'not rated' : `${ratings[i]} out of 10`}`} aria-pressed={active} className={active ? 'life-wheel-sector is-selected' : 'life-wheel-sector'} onClick={() => onSelect(item.name)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(item.name); } }}>
          <rect x={x - 42} y={y - 20} width="84" height="40" rx="10" className="life-wheel-label-bg" />
          <text x={x} y={y - 2} textAnchor="middle" fill={item.color} className="life-wheel-label">{labels[i]}</text>
          <text x={x} y={y + 13} textAnchor="middle" className="life-wheel-score">{ratings[i] || '—'}</text>
          {ratings[i] !== '' && <circle cx={dx} cy={dy} r={active ? 5 : 3.5} fill={item.color} className="life-wheel-point" />}
        </g>;
      })}
    </svg>
    <p className="life-wheel-caption">{rated} of 8 areas rated <span>· select an area to reflect</span></p>
  </div>;
}

/** Only a changed score moves, from the currently drawn shape; nothing animates on entry. */
function useWheelMotion(ratings: string[]): number[] {
  const target = ratings.map(Number).join(',');
  const [shown, setShown] = useState(() => target.split(',').map(Number));
  const position = useRef(shown);
  useEffect(() => {
    const next = target.split(',').map(Number);
    if (still()) { position.current = next; return; }
    const start = position.current;
    if (start.every((value, i) => value === next[i])) return;
    const began = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const time = Math.min(1, (now - began) / 220);
      const ease = 1 - Math.pow(1 - time, 3);
      const current = start.map((value, i) => value + ((next[i] ?? 0) - value) * ease);
      position.current = current;
      setShown(current);
      if (time < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return still() ? target.split(',').map(Number) : shown;
}
