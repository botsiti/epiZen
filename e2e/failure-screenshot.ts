import { createHash } from 'node:crypto';

/** A bounded filename, even for long, non-ASCII titles or titles containing path separators. */
export function failureScreenshotName(parent: string, title: string): string {
  const full = `${parent} - ${title}`;
  const label = full.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'test';
  const hash = createHash('sha256').update(full).digest('hex').slice(0, 12);
  return `FAILED-${label}-${hash}.png`;
}
