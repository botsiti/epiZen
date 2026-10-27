import { describe, expect, it } from 'vitest';
import { parseDay } from './day';
import { clip, dragged, drawn, folded, gridBlocks, lanes, shownHours } from './schedule';

const DAY = `### Tasks
- [ ] #daily/code — refactor the settings screen [minutes::58]
    - 09:26–10:24
- [x] #daily/cinema — film night [minutes::120]
    - 23:10–01:10
- [x] #daily/sport — gym: upper body [minutes::61]
    - 12:35–13:06
    - 13:43–14:13
`;
const min = (h: number, m: number) => h * 60 + m;
const hours = shownHours(false, false);

describe('the calendar’s layout', () => {
  it('reads each block with the task and block lines it came from, in the order of the day', () => {
    const blocks = gridBlocks(parseDay(DAY), DAY.replace(/\n/g, '\r\n'));
    expect(blocks.map((b) => [b.task.label, b.start, b.end])).toEqual([
      ['refactor the settings screen', min(9, 26), min(10, 24)],
      ['gym: upper body', min(12, 35), min(13, 6)],
      ['gym: upper body', min(13, 43), min(14, 13)],
      ['film night', min(23, 10), 24 * 60],
    ]);
    expect(blocks[0]?.taskRef).toEqual({ line: 1, text: '- [ ] #daily/code — refactor the settings screen [minutes::58]' });
    expect(blocks[0]?.blockRef).toEqual({ line: 2, text: '    - 09:26–10:24' });
    expect(blocks[3]?.realEnd).toBe(min(25, 10));
  });

  it('puts overlapping blocks side by side, and the rest full width', () => {
    const placed = lanes([
      { start: 60, end: 120 },
      { start: 90, end: 150 },
      { start: 130, end: 160 },
      { start: 200, end: 230 },
    ]);
    expect(placed.map((p) => [p.item.start, p.lane, p.lanes])).toEqual([
      [60, 0, 2],
      [90, 1, 2],
      [130, 0, 2],
      [200, 0, 1],
    ]);
  });

  it('shows 07–22 and folds the night, counting what reaches into each fold', () => {
    expect(hours).toEqual({ first: min(7, 0), last: min(22, 0) });
    expect(shownHours(true, true)).toEqual({ first: 0, last: 24 * 60 });
    expect(clip({ start: min(6, 30), end: min(7, 30) }, hours)).toEqual({ start: min(7, 0), end: min(7, 30) });
    expect(clip({ start: min(5, 0), end: min(6, 0) }, hours)).toBeUndefined();
    expect(folded([{ start: min(5, 0), end: min(6, 0) }, { start: min(21, 0), end: min(23, 0) }, { start: 600, end: 660 }], hours)).toEqual({ early: 1, late: 1 });
  });

  it('draws from 15-minute marks, at least 15 minutes, either way', () => {
    expect(drawn(min(9, 7), min(9, 7), hours)).toEqual({ start: min(9, 0), end: min(9, 15) });
    expect(drawn(min(9, 7), min(10, 20), hours)).toEqual({ start: min(9, 0), end: min(10, 15) });
    expect(drawn(min(10, 20), min(9, 7), hours)).toEqual({ start: min(9, 0), end: min(10, 15) });
    expect(drawn(min(21, 55), min(23, 0), hours)).toEqual({ start: min(21, 45), end: min(22, 0) });
  });

  it('moves a block on 15-minute marks keeping its length, and resizes it to at least 15 minutes', () => {
    const block = { start: min(10, 56), end: min(11, 9) };
    expect(dragged(block, 'move', 20, hours)).toEqual({ start: min(11, 15), end: min(11, 28) });
    expect(dragged(block, 'bottom', 30, hours)).toEqual({ start: min(10, 56), end: min(11, 45) });
    expect(dragged(block, 'bottom', -30, hours)).toEqual({ start: min(10, 56), end: min(11, 11) });
    expect(dragged(block, 'top', -50, hours)).toEqual({ start: min(10, 0), end: min(11, 9) });
    expect(dragged(block, 'move', -600, hours)).toEqual({ start: min(7, 0), end: min(7, 13) });
  });
});
