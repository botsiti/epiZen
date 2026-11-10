import { expect, it } from 'vitest';
import { addXp, compareXp, exactXp, floorXp, formatXp, restoreXp, roundXp, scaleXp, storeXp, subtractXp, sumXp, xpNumber } from './xp';

it('displays nearest whole XP with exact half-up rounding', () => {
  for (const [amount, shown] of [['33.3', '33'], ['33.6', '34'], ['33.5', '34'], ['0.499999999999999999', '0'], ['0.5', '1']]) expect(formatXp(exactXp(amount!))).toBe(shown);
});
it('keeps small awards when labels each round to zero, including after serialization', () => {
  const awards = Array.from({ length: 10 }, () => restoreXp(storeXp(exactXp('0.4'))));
  expect(awards.map(formatXp)).toEqual(Array(10).fill('0'));
  expect(sumXp(awards)).toEqual(exactXp(4));
  expect(sumXp([exactXp('0.5'), exactXp('0.5')])).toEqual(exactXp(1));
});
it('conserves exact shares without forcing their independently rounded labels to match', () => {
  const total = exactXp(101), shares = [3300, 3500, 3200].map((basisPoints) => scaleXp(total, basisPoints, 10000));
  expect(shares.map(formatXp)).toEqual(['33', '35', '32']);
  expect(sumXp(shares)).toEqual(total);
  expect(formatXp(total)).toBe('101');
  expect(scaleXp(exactXp(100), 3333, 10000)).toEqual(exactXp('33.33'));
});
it('uses exact amounts for boundaries and reverses the original amount without drift', () => {
  const below = exactXp('999.999999999999999999');
  expect(roundXp(below)).toBe(1000n);
  expect(floorXp(below)).toBe(999n);
  expect(compareXp(below, exactXp(1000))).toBe(-1);
  const reward = scaleXp(exactXp('1.5'), 3333, 10000);
  expect(subtractXp(addXp(below, reward), reward)).toEqual(below);
  expect(xpNumber(exactXp('1e-7'))).toBe(0.0000001);
  expect(exactXp('.5')).toEqual(exactXp('0.5'));
});
it('rejects malformed persisted amounts and non-finite or unbounded decimal inputs', () => {
  for (const value of [null, {}, { numerator: '3', denominator: '0' }, { numerator: '3.5', denominator: '1' }, { numerator: '1', denominator: '-1' }]) expect(() => restoreXp(value)).toThrow();
  for (const value of [NaN, Infinity, '1e1000', '', '0/1']) expect(() => exactXp(value)).toThrow();
});
