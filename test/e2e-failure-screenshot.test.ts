// @vitest-environment node
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { failureScreenshotName } from '../e2e/failure-screenshot';

describe('failure screenshot filenames', () => {
  it('keeps long Unicode titles and path separators within one portable filename', () => {
    const name = failureScreenshotName('vault/тест', 'очень длинное название / '.repeat(100));
    expect(basename(name)).toBe(name);
    expect(Buffer.byteLength(name)).toBeLessThanOrEqual(255);
    expect(name).toMatch(/^FAILED-[a-zA-Z0-9_-]+-[a-f0-9]{12}\.png$/);
  });

  it('distinguishes titles with the same truncated label', () => {
    const common = 'same title '.repeat(30);
    expect(failureScreenshotName('vault', `${common}first`)).not.toBe(failureScreenshotName('vault', `${common}second`));
  });
});
