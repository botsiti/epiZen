import { describe, expect, it } from 'vitest';
import { canDeleteHabit, habitDeletionEdits } from './habitDeletion';
import { newHabit, readHabit } from './habits';

const note = newHabit('Read', '2026-10-01', 'habit-read-001');
const definition = { path: note.path, text: note.text.replace('aliases: []', 'aliases: [Read a chapter]') };
const habit = readHabit(definition.path, definition.text)!;

describe('habit deletion', () => {
  it('removes only matching check-in lines and leaves prose, tasks, comments, fences and other habits byte-identical', () => {
    const expected = [
      '---', 'mood: 3', '---', '# Today', '- [x] Read', '',
      '> [!habits]', '> - [x] Read [habit::habit-read-001] [habit_value::4]', '> - [ ] Read [habit::habit-next-001]',
      '> - [x] Read a chapter', '> - [x] Sleep', '',
      '<!--', '> [!habits]', '> - [x] Read', '-->', '',
      '```md', '> [!habits]', '> - [x] Read [habit::habit-read-001]', '```', '',
    ].join('\r\n');
    const daily = { path: 'Journal/2026-10-01.md', text: expected };
    const reference = { path: 'Other.md', text: '> [!habits]\n> - [x] Read\n' };
    const tagged = { path: 'Old daily.md', text: '> [!habits]\n> - [x] Renamed [habit::habit-read-001]' };
    expect(habitDeletionEdits(habit, [definition, daily, reference, tagged], new Set([daily.path]))).toEqual([
      { path: daily.path, expected, text: expected.replace('> - [x] Read [habit::habit-read-001] [habit_value::4]\r\n', '').replace('> - [x] Read a chapter\r\n', '') },
      { path: tagged.path, expected: tagged.text, text: '> [!habits]\n' },
    ]);
  });

  it('requires the confirmed definition and keeps archived habits ineligible', () => {
    expect(() => habitDeletionEdits(habit, [{ ...definition, text: note.text + '\nEdited' }], new Set())).toThrow('habit changed');
    const archived = { ...habit, periods: [{ from: '2026-10-01', until: '2026-11-01' }] };
    expect(canDeleteHabit(archived, new Date(2026, 10, 1))).toBe(false);
    expect(canDeleteHabit(habit, new Date(2026, 10, 1))).toBe(true);
  });

  it('refuses a check-in that shares a line with a comment opener', () => {
    const day = { path: 'day.md', text: '> [!habits]\n> - [x] Read <!--\nprivate\n-->' };
    expect(() => habitDeletionEdits(habit, [definition, day], new Set([day.path]))).toThrow('contains a comment');
  });
});
