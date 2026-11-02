import { describe, expect, it } from 'vitest';
import { sleepParts, sleepValue } from './sleep';

describe('sleep duration', () => {
  it('reads decimal hours, rounds to minutes, and carries a rounded hour', () => {
    expect(sleepParts(6.1)).toEqual({ hours: '6', minutes: '6' });
    expect(sleepParts(7.9999)).toEqual({ hours: '8', minutes: '0' });
    expect(sleepParts()).toEqual({ hours: '', minutes: '' });
    expect(sleepParts(0)).toEqual({ hours: '0', minutes: '0' });
  });
  it('round-trips every minute of a day through compatible decimal-hour Markdown', () => {
    for (let total = 0; total <= 1440; total += 1) {
      const hours = String(Math.floor(total / 60)); const minutes = String(total % 60);
      expect(sleepParts(Number(sleepValue(hours, minutes)))).toEqual({ hours, minutes });
    }
    expect(sleepValue('7', '30')).toBe('7.5');
    expect(sleepValue('', '')).toBe('');
    expect(sleepValue('', '15')).toBe('0.25');
  });
  it.each([['-1', '0'], ['7.5', '0'], ['7', '60'], ['7', '-1'], ['7', '1.5'], ['24', '1'], ['25', '0'], ['NaN', '0']])('rejects invalid %sh %sm without normalizing it silently', (hours, minutes) => {
    expect(() => sleepValue(hours, minutes)).toThrow();
  });
});
