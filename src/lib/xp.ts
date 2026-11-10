/** Exact XP arithmetic. Only labels and chart coordinates are converted to ordinary numbers. */
export interface ExactXp { readonly numerator: bigint; readonly denominator: bigint }
export interface StoredXp { numerator: string; denominator: string }
export const ZERO_XP: ExactXp = Object.freeze({ numerator: 0n, denominator: 1n });

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a; b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}
export function xpRatio(numerator: bigint, denominator: bigint = 1n): ExactXp {
  if (!denominator) throw new Error('XP cannot have a zero denominator.');
  if (!numerator) return ZERO_XP;
  if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

/** Decimal input is interpreted as written, including small values printed in exponent notation. */
export function exactXp(value: number | string | bigint): ExactXp {
  if (typeof value === 'bigint') return xpRatio(value);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Enter a finite XP amount.');
  const text = String(value).trim();
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(text);
  if (!match || text.length > 100) throw new Error('Enter a valid decimal XP amount.');
  const fraction = match[3] ?? match[4] ?? '', exponent = Number(match[5] ?? 0) - fraction.length;
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 40) throw new Error('The XP amount has too many decimal places.');
  const integer = BigInt(`${match[2] ?? '0'}${fraction}`) * (match[1] === '-' ? -1n : 1n);
  return exponent >= 0 ? xpRatio(integer * 10n ** BigInt(exponent)) : xpRatio(integer, 10n ** BigInt(-exponent));
}
export const addXp = (a: ExactXp, b: ExactXp): ExactXp => xpRatio(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator);
export const subtractXp = (a: ExactXp, b: ExactXp): ExactXp => xpRatio(a.numerator * b.denominator - b.numerator * a.denominator, a.denominator * b.denominator);
export const multiplyXp = (a: ExactXp, b: ExactXp): ExactXp => xpRatio(a.numerator * b.numerator, a.denominator * b.denominator);
export const scaleXp = (value: ExactXp, numerator: number | bigint, denominator: number | bigint = 1): ExactXp => multiplyXp(value, xpRatio(BigInt(numerator), BigInt(denominator)));
export function compareXp(a: ExactXp, b: ExactXp): -1 | 0 | 1 {
  const difference = a.numerator * b.denominator - b.numerator * a.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}
export const minXp = (a: ExactXp, b: ExactXp): ExactXp => compareXp(a, b) <= 0 ? a : b;
export const maxXp = (a: ExactXp, b: ExactXp): ExactXp => compareXp(a, b) >= 0 ? a : b;
export function sumXp(values: Iterable<ExactXp>): ExactXp {
  let total = ZERO_XP;
  for (const value of values) total = addXp(total, value);
  return total;
}
export const xpNumber = (value: ExactXp): number => Number(value.numerator) / Number(value.denominator);
/** Use the exact floor for level boundaries; a rounded label must never unlock a level. */
export function floorXp(value: ExactXp): bigint {
  const whole = value.numerator / value.denominator;
  return value.numerator < 0n && value.numerator % value.denominator ? whole - 1n : whole;
}
/** Nearest whole XP, with halves up. Signed corrections use the same rule on their magnitude. */
export function roundXp(value: ExactXp): bigint {
  const absolute = value.numerator < 0n ? -value.numerator : value.numerator;
  const whole = (2n * absolute + value.denominator) / (2n * value.denominator);
  return value.numerator < 0n ? -whole : whole;
}
const wholeFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
export const formatXp = (value: ExactXp | number): string => wholeFormat.format(roundXp(typeof value === 'number' ? exactXp(value) : value));
export const storeXp = (value: ExactXp): StoredXp => ({ numerator: value.numerator.toString(), denominator: value.denominator.toString() });
export function restoreXp(value: unknown): ExactXp {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The saved XP amount is invalid.');
  const stored = value as Record<string, unknown>;
  if (typeof stored.numerator !== 'string' || typeof stored.denominator !== 'string' || !/^-?\d{1,80}$/.test(stored.numerator) || !/^[1-9]\d{0,79}$/.test(stored.denominator)) throw new Error('The saved XP amount is invalid.');
  return xpRatio(BigInt(stored.numerator), BigInt(stored.denominator));
}
