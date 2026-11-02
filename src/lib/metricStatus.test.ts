import { expect, it } from 'vitest';
import { metricMean, metricStatus } from './metricStatus';
import { parseDay } from './day';

it.each(['mood', 'energy', 'focus', 'soc'])('uses the requested bands for %s and averages', (key) => {
  for (const value of [1, 2, 2.49]) expect(metricStatus(key, value)).toBe('red');
  for (const value of [2.5, 3, 3.2, 3.49]) expect(metricStatus(key, value)).toBe('yellow');
  for (const value of [3.5, 3.51, 4, 5]) expect(metricStatus(key, value)).toBe('green');
  expect(metricStatus(key, undefined)).toBe('empty');expect(metricStatus(key, 0)).toBe('empty');
  expect(metricStatus(key, 7, 10)).toBe('green');
});
it('colours sleep below 6 or above 9 red, 6–7 yellow and 7–9 green', () => {
  for (const value of [0, 5.9, 9.01, 12]) expect(metricStatus('sleep', value)).toBe('red');
  for (const value of [6, 6.9]) expect(metricStatus('sleep', value)).toBe('yellow');
  for (const value of [7, 8, 9]) expect(metricStatus('sleep', value)).toBe('green');
  expect(metricStatus('sleep', undefined)).toBe('empty');
});
it('keeps the unrounded average for boundary decisions and ignores unfilled scores', () => {
  const days = [3.49, 3.49, 0].map((mood) => ({ date: new Date(), day: parseDay(`---\nmood: ${mood}\n---\n`) }));
  expect(metricMean(days, 'mood')).toBe(3.49);
  expect(metricStatus('mood', metricMean(days, 'mood'))).toBe('yellow');
});
