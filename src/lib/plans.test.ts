import { describe, expect, it } from 'vitest';
import type { CalendarEvent, CalendarInfo } from './api';
import { at, calendarFor, parseTaskUrl, planWindow, plansOn, sameLink, taskUrl } from './plans';

const LINK = { vault: 'Kaizen', note: 'Calendar/2026/days 2026/28.10.2026.md', id: '20261028-03' };
const DAY = new Date(2026, 9, 28);
const event = (id: string, start: number, end: number, more: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, calendar: 'home', title: id, start, end, allDay: false, writable: true, ...more });
const calendar = (id: string, title: string, more: Partial<CalendarInfo> = {}): CalendarInfo => ({ id, title, color: '#5b8def', writable: true, default: false, ...more });

describe('a plan’s link to its task', () => {
  it('reads back what it wrote, spaces and slashes in the note’s path too', () => {
    const url = taskUrl(LINK);
    expect(url.startsWith('epizen://task?')).toBe(true);
    expect(parseTaskUrl(url)).toEqual(LINK);
    expect(sameLink(parseTaskUrl(url), LINK)).toBe(true);
    expect(sameLink(parseTaskUrl(url), { ...LINK, vault: 'epizen-vault' })).toBe(false);
  });

  it('is nothing for an event of Calendar’s own, or a link with a part missing', () => {
    expect(parseTaskUrl(undefined)).toBeUndefined();
    expect(parseTaskUrl(null)).toBeUndefined();
    expect(parseTaskUrl('https://zoom.us/j/1')).toBeUndefined();
    expect(parseTaskUrl('epizen://task?vault=Kaizen&note=a.md')).toBeUndefined();
  });
});

describe('the calendar a plan goes to', () => {
  const calendars = [calendar('home', 'Home', { default: true }), calendar('edu', 'education'), calendar('sport', 'Sport'), calendar('ro', 'business', { writable: false })];

  it('is the one chosen last for the category, else one named like it, else Senioro’s, else the default', () => {
    expect(calendarFor('sport', calendars, { sport: 'edu' })?.id).toBe('edu');
    expect(calendarFor('Sport', calendars, {})?.id).toBe('sport');
    expect(calendarFor('code', calendars, {})?.id).toBe('edu');
    expect(calendarFor('dog', calendars, {})?.id).toBe('home');
    expect(calendarFor(undefined, calendars, {})?.id).toBe('home');
  });

  it('never is one that takes no changes, or one that is gone', () => {
    expect(calendarFor('business', calendars, { business: 'ro' })?.id).toBe('home');
    expect(calendarFor('code', calendars, { code: 'gone' })?.id).toBe('edu');
    expect(calendarFor('code', [calendar('ro', 'Holidays', { writable: false })], {})).toBeUndefined();
  });
});

describe('plans on a day', () => {
  it('cut each timed event to the day, in minutes since its midnight, in order', () => {
    const night = event('night', at(new Date(2026, 9, 27), 23 * 60), at(DAY, 60));
    const run = event('run', at(DAY, 18 * 60), at(DAY, 18 * 60 + 45), { url: taskUrl(LINK) });
    const holiday = event('holiday', at(DAY, 0), at(new Date(2026, 9, 29), 0), { allDay: true });
    const tomorrow = event('tomorrow', at(new Date(2026, 9, 29), 9 * 60), at(new Date(2026, 9, 29), 10 * 60));
    const plans = plansOn([run, night, holiday, tomorrow], DAY);
    expect(plans.map((plan) => [plan.event.id, plan.start, plan.end, plan.cut])).toEqual([
      ['night', 0, 60, true],
      ['run', 18 * 60, 18 * 60 + 45, false],
    ]);
    expect(plans[1]?.link).toEqual(LINK);
    expect(plans[1]?.key).toBe(`run@${run.start}`);
  });

  it('runs to midnight for an event that goes on to the next day', () => {
    const late = event('late', at(DAY, 23 * 60), at(new Date(2026, 9, 29), 30));
    expect(plansOn([late], DAY).map((plan) => [plan.start, plan.end, plan.cut])).toEqual([[23 * 60, 24 * 60, true]]);
  });

  it('looks for a task’s events a month either side of its day', () => {
    const { from, to } = planWindow(DAY);
    expect(new Date(from)).toEqual(new Date(2026, 8, 28));
    expect(new Date(to)).toEqual(new Date(2026, 10, 28));
  });
});
