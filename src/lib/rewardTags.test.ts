import { expect, it } from 'vitest';
import { parseDay } from './day';
import { addTask } from './edits';
import { editTask, findTask } from './timeblocks';

it('creates, reads and edits Unicode category tags while preserving unrelated Markdown', () => {
  const original = '# Journal\r\n\r\n### Tasks\r\n\r\n## Other\r\nDo not change [[this]].\r\n';
  const added = addTask(original, 'Фокус', 'Read', 10);
  const task = parseDay(added).tasks[0]!;
  expect(task.category?.name).toBe('фокус');
  expect(task.label).toBe('Read');
  expect(added).toContain('## Other\r\nDo not change [[this]].\r\n');
  const changed = editTask(added, { line: task.line, text: added.split('\r\n')[task.line]! }, { words: 'Write', category: 'Écriture', minutes: 10 });
  expect(parseDay(changed).tasks[0]?.category?.name).toBe('écriture');
  expect(findTask(changed, { label: 'Write', category: 'e\u0301criture' }).line).toBe(task.line);
  expect(changed).toContain('## Other\r\nDo not change [[this]].\r\n');
});
