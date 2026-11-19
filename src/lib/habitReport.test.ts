import { expect, it } from 'vitest';
import { parseDay } from './day';
import { newHabit, readHabit } from './habits';
import { habitReport } from './habitReport';
import { day } from './dates';

it('exports schedules, customized definitions, legacy and orphan rows and explicit zero measurements without unrelated diary text', () => {
  const note = newHabit('Mood | score', '2026-11-01', 'habit-mood-001', undefined, { kind: 'measure', unit: 'points' });
  const source = note.text + '\n```md\nDefinition examples\n```\n';
  const habit = readHabit(note.path, source)!;
  const date = day(2026, 10, 4);
  const daily = parseDay('# Private diary\nAn unrelated thought.\n\n> [!habits]\n> - [x] Mood | score [habit::habit-mood-001] [habit_value::0]\n> - [ ] Old walk\n> - [x] Lost definition [habit::missing-habit]\n');
  const report = habitReport([habit], [{ date, path: 'days/2026-11-04.md', day: daily }], [{ path: 'Habits/unfinished.md', source: 'unrecognized definition', message: 'Invalid schedule' }], date);
  expect(report).toContain('Mood \\| score · 0');
  expect(report).toContain('- [ ] Old walk');
  expect(report).toContain('[habit::missing-habit]');
  expect(report).toContain(source);
  expect(report).toContain('unrecognized definition');
  expect(report).not.toContain('An unrelated thought.');
});
