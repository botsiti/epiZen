import { expect, it } from 'vitest';
import { newHabit, readHabit } from './habits';
import { writeHabitStyle } from './habitStyle';

it.each(['\n', '\r\n'])('edits only the chosen appearance properties, preserving comments and history (%j)', (eol) => {
  const note = newHabit('Water', '2026-11-01', 'water-00001', undefined, undefined, { icon: '💧' });
  const src = (note.text.replace('icon: 💧', 'icon: 💧 # keep me') + 'Private reflection.\n').replaceAll('\n', eol);
  const habit = readHabit(note.path, src)!;
  expect(habit.icon).toBe('💧');
  const styled = writeHabitStyle(src, habit, { icon: '🌙', color: '#8fbcaa' });
  expect(readHabit(note.path, styled)).toMatchObject({ icon: '🌙', color: '#8fbcaa' });
  expect(styled.replace('icon: "🌙"', 'icon: 💧').replace(eol + 'color: "#8fbcaa"', '')).toBe(src);
  const shown = readHabit(note.path, styled)!;
  expect(writeHabitStyle(styled, shown, shown)).toBe(styled);
  expect(readHabit(note.path, writeHabitStyle(styled, shown, {}))?.icon).toBeUndefined();
});
