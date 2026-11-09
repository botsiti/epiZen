import { expect, it } from 'vitest';
import { speechChunks } from './speech';
it('reads long multilingual replies completely without splitting Unicode characters', () => {
  const text = ('A complete thought. Следующая мысль. 🐕 心情更平静。\n').repeat(300);
  const chunks = speechChunks(text);
  expect(chunks.length).toBeGreaterThan(3);
  expect(chunks.join('')).toBe(text);
  for (const chunk of chunks) { expect(Array.from(chunk).length).toBeLessThanOrEqual(1200); expect(new TextEncoder().encode(chunk).length).toBeLessThan(8000); expect(chunk).not.toContain('\uFFFD'); }
});
