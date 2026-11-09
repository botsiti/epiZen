import { expect, it } from 'vitest';
import { SPIKE_FRAMES, spikeFrame, spikeLook } from './spike';
it('uses only populated atlas cells and respects the original variable-duration frames', () => {
  expect(spikeFrame('idle', 279)).toEqual({ column: 0, row: 0 });
  expect(spikeFrame('idle', 280)).toEqual({ column: 1, row: 0 });
  expect(spikeFrame('idle', 1100)).toEqual({ column: 0, row: 0 });
  for (const state of Object.keys(SPIKE_FRAMES) as (keyof typeof SPIKE_FRAMES)[]) {
    for (let time = 0; time < 4000; time += 17) expect(spikeFrame(state, time).column).toBeLessThan(SPIKE_FRAMES[state].durations.length);
  }
});
it('looks toward all four cardinal directions and stays neutral in the dead zone', () => {
  expect(spikeLook(0, -100)).toEqual({ column: 0, row: 9 });
  expect(spikeLook(100, 0)).toEqual({ column: 4, row: 9 });
  expect(spikeLook(0, 100)).toEqual({ column: 0, row: 10 });
  expect(spikeLook(-100, 0)).toEqual({ column: 4, row: 10 });
  expect(spikeLook(3, -4)).toBeUndefined();
});
