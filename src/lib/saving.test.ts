import { describe, expect, it } from 'vitest';
import { flushAll, flushBeforeClose } from './saving';

describe('flushAll', () => {
  it('waits for every registered save and lists the notes that could not be saved', async () => {
    const order: string[] = [];
    const stopA = flushBeforeClose(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push('a');
      return undefined;
    });
    const stopB = flushBeforeClose(() => {
      order.push('b');
      return Promise.resolve(undefined);
    });
    expect(await flushAll()).toEqual([]);
    expect(order.sort()).toEqual(['a', 'b']);

    const stopC = flushBeforeClose(() => Promise.resolve('Ideas/b.md'));
    const stopD = flushBeforeClose(() => Promise.resolve('Ideas/a.md'));
    expect(await flushAll()).toEqual(['Ideas/a.md', 'Ideas/b.md']);
    for (const stop of [stopA, stopB, stopC, stopD]) stop();
    expect(await flushAll()).toEqual([]);
  });
});
