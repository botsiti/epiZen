import type { DayEntry } from './rollup';

export type MetricStatus = 'red' | 'yellow' | 'green' | 'empty';

/** The user's review bands. Scores on older 10/100 scales are normalized to five. */
export function metricStatus(key: string, value: number | undefined, scale = 5): MetricStatus {
  if (value === undefined || !Number.isFinite(value)) return 'empty';
  if (key === 'sleep') return value < 6 || value > 9 ? 'red' : value < 7 ? 'yellow' : 'green';
  if (value <= 0 || !['mood', 'energy', 'focus', 'soc'].includes(key)) return 'empty';
  const score = value * 5 / scale;
  return score < 2.5 ? 'red' : score < 3.5 ? 'yellow' : 'green';
}

export const metricColor = (key: string, value: number | undefined, scale = 5) => `var(--metric-${metricStatus(key, value, scale)})`;

/** Use the unrounded mean for colour decisions; display rounding must not move a boundary. */
export function metricMean(days: DayEntry[], key: string): number | undefined {
  const values = days.map(({ day }) => day?.numbers[key]).filter((value): value is number => value !== undefined && Number.isFinite(value) && (key === 'sleep' || value > 0));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
}
