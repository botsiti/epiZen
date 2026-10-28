import { describe, expect, it } from 'vitest';
import { flushAll, flushBeforeClose, trackSave, whenSaved } from './saving';

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

  it('also waits for a save already under way, and counts its failure', async () => {
    let finish: (path: string | undefined) => void = () => undefined;
    void trackSave(new Promise((resolve) => (finish = resolve)));
    const flushed = flushAll();
    finish('Inbox idea.md');
    expect(await flushed).toEqual(['Inbox idea.md']);
    expect(await flushAll()).toEqual([]);
  });
});

describe('whenSaved', () => {
  it('waits for the saves under way, landed or failed, and not for registered flushes', async () => {
    const stop = flushBeforeClose(() => new Promise(() => undefined));
    expect(await whenSaved()).toBeUndefined();
    let finish: (path: string | undefined) => void = () => undefined;
    let fail: (path: string | undefined) => void = () => undefined;
    void trackSave(new Promise((resolve) => (finish = resolve)));
    void trackSave(new Promise((resolve) => (fail = resolve)));
    let done = false;
    const waiting = whenSaved().then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    finish(undefined);
    await Promise.resolve();
    expect(done).toBe(false);
    // A save that failed resolves to its note.
    fail('Inbox idea.md');
    await waiting;
    expect(done).toBe(true);
    stop();
  });
});
