import { describe, expect, it } from 'vitest';
import { flushAll, flushBeforeClose } from './saving';

describe('flushAll', () => {
  it('waits for every registered save and says whether all of them landed', async () => {
    const order: string[] = [];
    const stopA = flushBeforeClose(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push('a');
      return true;
    });
    const stopB = flushBeforeClose(() => Promise.resolve(order.push('b') > 0));
    expect(await flushAll()).toBe(true);
    expect(order.sort()).toEqual(['a', 'b']);

    const stopC = flushBeforeClose(() => Promise.resolve(false));
    expect(await flushAll()).toBe(false);
    stopC();
    stopA();
    stopB();
    expect(await flushAll()).toBe(true);
  });
});
