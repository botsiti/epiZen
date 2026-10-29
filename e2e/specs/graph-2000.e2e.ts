import { $, browser, expect } from '@wdio/globals';
import { prepareWindow, screenshot } from '../support';

describe('a vault of 2,000 notes', () => {
  before(prepareWindow);

  it('draws its graph smoothly while it lays out and the pointer moves', async () => {
    await $('[data-testid="open-graph"]').click();
    const graph = $('[data-testid="graph"]');
    await expect(graph).toHaveAttribute('data-nodes', '2000');
    // Frames per second over two seconds of layout, with the pointer moving across the dots.
    const fps = await browser.execute(
      () =>
        new Promise<number>((done) => {
          const canvas = document.querySelector('.graph-canvas');
          let start: number | undefined;
          let frames = 0;
          const frame = () => {
            // A background window can wait a long time for its first frame. Measure the
            // frames after it starts, not that unrelated scheduling delay.
            start ??= performance.now();
            frames += 1;
            const rect = canvas?.getBoundingClientRect();
            if (rect) {
              const at = { clientX: rect.left + Math.random() * rect.width, clientY: rect.top + Math.random() * rect.height };
              canvas?.dispatchEvent(new MouseEvent('mousemove', { ...at, bubbles: true }));
            }
            const elapsed = performance.now() - start;
            if (elapsed < 2000) requestAnimationFrame(frame);
            else done((frames * 1000) / elapsed);
          };
          requestAnimationFrame(frame);
        }),
    );
    expect(fps).toBeGreaterThan(30);
    await browser.waitUntil(async () => (await graph.getAttribute('data-settled')) === 'true', {
      timeout: 30_000,
      timeoutMsg: 'the layout never settled',
    });
    await screenshot('21-graph-2000');
  });
});
