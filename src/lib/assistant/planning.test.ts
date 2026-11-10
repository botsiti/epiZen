import { describe, expect, it, vi } from 'vitest';
import { builtInPeriodicText, DEFAULT_PERIODIC, periodicPath } from '../periodic';
import { parseDay } from '../day';
import { parseQuests } from '../quests';
import { readMonthlySection } from '../monthlyReview';
import type { CalendarEvent } from '../api';
import { calendarSlot } from './planning';
import { createToolHandler, type AssistantToolPorts } from './tools';
import { DEFAULT_ASSISTANT, type AssistantContext } from './types';
const now = new Date(2026, 10, 10, 8), path = 'Journal/10.11.2026.md';
const original = builtInPeriodicText('day', now).replaceAll('\n', '\r\n') + 'Keep [[my links]] and spaces  \r\n';
function setup() {
  const context: AssistantContext = { root: '/copy', now, periodic: DEFAULT_PERIODIC, settings: DEFAULT_ASSISTANT, dailyPath: path, files: [{ path, kind: 'note' }], texts: new Map([[path, original]]), features: { periodic: true, cbt: true, quests: true, library: true, calendar: true } };
  const ports: AssistantToolPorts = { context: () => context, readNote: vi.fn().mockResolvedValue(original), lookupMedia: vi.fn().mockResolvedValue([]), listCalendars: vi.fn().mockResolvedValue([{ id: 'work', title: 'Work', writable: true }]), listEvents: vi.fn().mockResolvedValue([]) };
  const execute = createToolHandler(context.root, ports);
  const call = (name: string, args: unknown = {}) => execute({ type: 'function_call', call_id: name, name, arguments: JSON.stringify(args) }, new AbortController().signal);
  return { context, ports, call };
}
it('opens today’s existing CBT form without writing, and proposes only a missing daily note', async () => {
  const { call, context, ports } = setup();
  expect(await call('start_cbt')).toMatchObject({ openPath: path, openCbt: true, startCbt: true, value: { opened: true } });
  expect((await call('start_cbt')).change).toBeUndefined();
  expect(ports.readNote).toHaveBeenCalledWith('/copy', path);
  context.files = []; context.texts = new Map(); context.dailyPath = undefined;
  const missing = await call('start_cbt');
  expect(missing.change).toMatchObject({ before: null, after: builtInPeriodicText('day', now) });
  expect(missing.startCbt).toBe(true);
  context.dailyAmbiguous = true;
  await expect(call('start_cbt')).rejects.toThrow('Several notes');
});
it('adds business, biology and code tasks without rewriting existing text or claiming time was worked', async () => {
  const { call, ports } = setup();
  const args = { date: '', tasks: [{ category: 'business', title: 'Research marketing on X' }, { category: 'biology', title: 'Do the CRISPR course' }, { category: 'code', title: 'Add feature X to Mr Suit' }] };
  const result = await call('add_tasks', args);
  if (result.change?.kind !== 'note') throw new Error('Expected a note proposal');
  const tasks = parseDay(result.change.after).tasks;
  expect(tasks.map((task) => task.category?.name)).toEqual(['business', 'biology', 'code']);
  expect(result.change.after).not.toContain('[minutes::');
  expect(result.change.after.split('\r\n').filter((line) => !line.startsWith('- [ ] #daily/')).join('\r\n')).toBe(original);
  vi.mocked(ports.readNote).mockResolvedValue(result.change.after);
  const repeated = await call('add_tasks', args);
  expect(repeated.change).toMatchObject({ before: result.change.after, after: result.change.after });
  await expect(call('add_tasks', { date: '', tasks: [{ category: 'code', title: 'Claim [minutes::900]' }] })).rejects.toThrow('field');
});
it('uses the normal monthly quest and reflection format while preserving unrelated content', async () => {
  const { call, context, ports } = setup();
  const monthPath = periodicPath('month', now, context.periodic), month = builtInPeriodicText('month', now) + '\nKeep this outside the reflection.\n';
  context.files.push({ path: monthPath, kind: 'note' }); context.texts = new Map([[monthPath, month]]);
  vi.mocked(ports.readNote).mockResolvedValue(month);
  const quest = await call('add_quest', { period: 'month', date: '', title: 'Finish the CRISPR course', sphere: 'Personal Growth', tier: 'common', xp: 0, target: 0 });
  if (quest.change?.kind !== 'note') throw new Error('Expected a quest');
  expect(parseQuests(monthPath, quest.change.after)[0]).toMatchObject({ title: 'Finish the CRISPR course', scope: 'monthly', xp: 150 });
  expect(quest.change.after).toContain('Keep this outside the reflection.');
  const section = await call('update_period_section', { period: 'month', date: '', section: 'decisions', text: 'I chose to focus on biology.' });
  if (section.change?.kind !== 'note') throw new Error('Expected a section');
  expect(readMonthlySection(section.change.after, 'decisions').value.trim()).toBe('I chose to focus on biology.');
  expect(section.change.after).toContain('Keep this outside the reflection.');
  await expect(call('add_quest', { period: 'day', date: '', title: 'Oops', sphere: 'Personal Growth', tier: 'common', xp: 0, target: 0 })).rejects.toThrow('week or month');
});
it('contains disabled-feature and failed calendar lookups without blocking ordinary note reads', async () => {
  const { call, context, ports } = setup();
  context.features!.cbt = false;
  await expect(call('start_cbt')).rejects.toThrow('Enable CBT');
  expect(ports.readNote).not.toHaveBeenCalled();
  expect((await call('read_note', { path })).value).toMatchObject({ text: original });
  vi.mocked(ports.listEvents).mockRejectedValue(new Error('Calendar unavailable'));
  await call('list_calendars');
  await expect(call('plan_block', { calendar: 'work', date: '', title: 'code', notes: 'Feature X', minutes: 90, start: '09:30', window: 'morning' })).rejects.toThrow('Calendar unavailable');
  expect((await call('read_note', { path })).value).toMatchObject({ text: original });
});
it('plans an exact 09:30–11:00 block and requires a known writable calendar', async () => {
  const { call, ports } = setup();
  const args = { calendar: 'work', date: '', title: 'code', notes: 'Add feature X to Mr Suit', minutes: 90, start: '09:30', window: 'morning' };
  await expect(call('plan_block', args)).rejects.toThrow('List calendars');
  await call('list_calendars');
  const result = await call('plan_block', args);
  expect(result.change).toMatchObject({ kind: 'calendar', title: 'code', notes: args.notes, start: new Date(2026, 10, 10, 9, 30).getTime(), end: new Date(2026, 10, 10, 11).getTime(), avoidConflicts: true });
  expect(ports.listEvents).toHaveBeenCalledWith(new Date(2026, 10, 10).getTime(), new Date(2026, 10, 11).getTime());
});
describe('local free slots', () => {
  const date = new Date(2026, 10, 10), at = (hour: number, minute = 0) => new Date(2026, 10, 10, hour, minute).getTime();
  const event = (from: number, to: number): CalendarEvent => ({ id: 'busy', title: 'Other appointment', calendar: 'another', start: at(from), end: at(to), writable: false, allDay: false });
  it('fits morning and afternoon durations around all calendars and retains the full duration', () => {
    expect(calendarSlot(date, now, 120, '', 'morning', [event(9, 10)])).toEqual({ start: at(10), end: at(12) });
    expect(calendarSlot(date, now, 120, '', 'afternoon', [event(12, 14)])).toEqual({ start: at(14), end: at(16) });
    expect(() => calendarSlot(date, now, 180, '', 'morning', [event(9, 10)])).toThrow('no free');
    expect(() => calendarSlot(date, now, 90, '09:30', 'morning', [event(10, 11)])).toThrow('overlaps');
  });
  it('avoids past suggestions, validates durations and does not silently move to another date', () => {
    expect(calendarSlot(date, new Date(2026, 10, 10, 14, 7), 120, '', 'afternoon', [])).toEqual({ start: at(14, 15), end: at(16, 15) });
    expect(() => calendarSlot(date, new Date(2026, 10, 11), 60, '', 'any', [])).toThrow('no free');
    expect(() => calendarSlot(date, now, -1, '', 'any', [])).toThrow('duration');
    expect(() => calendarSlot(date, now, 120, '23:30', 'any', [])).toThrow('selected day');
    expect(() => calendarSlot(date, now, 60, '24:00', 'any', [])).toThrow('HH:mm');
  });
});
