import { describe, expect, it } from 'vitest';
import type { VaultFile } from './api';
import { day } from './dates';
import {
  DEFAULT_PERIODIC,
  fillTemplate,
  periodicIndex,
  periodicPath,
  periodicSettings,
  periodKey,
  periodOf,
  periodOfName,
  type PeriodicSettings,
} from './periodic';

// The demo vault's setup, as the e2e tests seed it.
const DEMO: PeriodicSettings = {
  day: { folder: 'Calendar/2026/days 2026', format: 'DD.MM.YYYY', template: 'Templates/Daily' },
  week: { folder: 'Calendar/2026/weeks', format: 'GGGG-[W]WW - DD.MM.YY', template: 'Templates/Weekly' },
  month: { folder: 'Calendar/2026/months 2026', format: 'MM.YY [RPG]', template: 'Templates/Monthly' },
};

describe('periodicSettings', () => {
  it("fills in Obsidian's defaults and ignores what isn't a string", () => {
    expect(periodicSettings({})).toEqual(DEFAULT_PERIODIC);
    const read = periodicSettings({ periodic: { day: { folder: 'Daily', format: 42 }, week: 'nonsense' } });
    expect(read.day).toEqual({ folder: 'Daily', format: 'YYYY-MM-DD', template: '' });
    expect(read.week).toEqual(DEFAULT_PERIODIC.week);
  });
});

describe('periodic note paths', () => {
  it('puts each note in its folder, under its formatted name', () => {
    expect(periodicPath('day', day(2026, 9, 24), DEMO)).toBe('Calendar/2026/days 2026/24.10.2026.md');
    expect(periodicPath('week', day(2026, 7, 14), DEMO)).toBe('Calendar/2026/weeks/2026-W33 - 10.08.26.md');
    expect(periodicPath('month', day(2026, 7, 14), DEMO)).toBe('Calendar/2026/months 2026/08.26 RPG.md');
    expect(periodicPath('day', day(2026, 9, 24), DEFAULT_PERIODIC)).toBe('2026-10-24.md');
  });

  it('tells which day, week or month a note stands for, only inside its folder', () => {
    expect(periodOf('Calendar/2026/days 2026/14.08.2026.md', DEMO)).toEqual({ period: 'day', date: day(2026, 7, 14) });
    expect(periodOf('Calendar/2026/weeks/2026-W33 - 10.08.26.md', DEMO)).toEqual({ period: 'week', date: day(2026, 7, 10) });
    expect(periodOf('Calendar/2026/months 2026/08.26 RPG.md', DEMO)).toEqual({ period: 'month', date: day(2026, 7, 1) });
    expect(periodOf('Archive/14.08.2026.md', DEMO)).toBeUndefined();
    expect(periodOf('Rating/music/Glasshouse Weather.md', DEMO)).toBeUndefined();
  });

  it('reads a link target like [[24.10.2026]] as a day, week or month', () => {
    expect(periodOfName('24.10.2026', DEMO)).toEqual({ period: 'day', date: day(2026, 9, 24) });
    expect(periodOfName('2026-W43 - 19.10.26', DEMO)).toEqual({ period: 'week', date: day(2026, 9, 19) });
    expect(periodOfName('10.26 RPG', DEMO)).toEqual({ period: 'month', date: day(2026, 9, 1) });
    expect(periodOfName('Glasshouse Weather', DEMO)).toBeUndefined();
  });

  it('indexes the notes that exist', () => {
    const files: VaultFile[] = [
      { path: 'Calendar/2026/days 2026/14.08.2026.md', kind: 'note' },
      { path: 'Calendar/2026/weeks/2026-W33 - 10.08.26.md', kind: 'note' },
      { path: 'Calendar/2026/days 2026/_attachments/14.08.2026.png', kind: 'image' },
    ];
    const index = periodicIndex(files, DEMO);
    expect(index.get(periodKey('day', day(2026, 7, 14)))).toBe('Calendar/2026/days 2026/14.08.2026.md');
    expect(index.get(periodKey('week', day(2026, 7, 16)))).toBe('Calendar/2026/weeks/2026-W33 - 10.08.26.md');
    expect(index.size).toBe(2);
  });
});

describe('fillTemplate', () => {
  // Lines from demo-vault/Templates/Daily.md.
  const template = `---
date: {{date:YYYY-MM-DDTHH:mm}}
---
> [[{{date-1d:DD.MM.YYYY}}|← Yesterday]] | [[{{date+1d:DD.MM.YYYY}}|Tomorrow →]] | [[{{monday:GGGG-[W]WW - DD.MM.YY}}|Week]] | **[[{{date:MM.YY [RPG]}}|{{date:MM.YY}}]]**

## {{date:dddd, MMMM Do, YYYY}}
`;

  it("fills the demo vault's daily template the way the existing days read", () => {
    const text = fillTemplate(template, { title: '31.07.2026', date: day(2026, 6, 31), format: 'DD.MM.YYYY', now: new Date(2026, 9, 25, 21, 5) });
    expect(text).toContain('date: 2026-07-31T21:05');
    expect(text).toContain('[[30.07.2026|← Yesterday]] | [[01.08.2026|Tomorrow →]] | [[2026-W31 - 27.07.26|Week]] | **[[07.26 RPG|07.26]]**');
    expect(text).toContain('## Friday, July 31st, 2026');
    expect(text).not.toContain('{{');
  });

  it('knows title, bare date and time, and leaves unknown variables alone', () => {
    const context = { title: 'Idea', date: day(2026, 9, 24), format: 'YYYY-MM-DD', now: new Date(2026, 9, 25, 9, 30) };
    expect(fillTemplate('{{title}} {{date}} {{time}} {{tomorrow}} {{date+1w:DD.MM}} {{unknown}}', context)).toBe(
      'Idea 2026-10-24 09:30 2026-10-25 31.10 {{unknown}}',
    );
  });

  it('keeps month and year offsets inside the month, as moment does', () => {
    const at = (date: Date) => ({ title: '', date, format: 'YYYY-MM-DD', now: new Date(2026, 0, 1) });
    expect(fillTemplate('{{date+1M}} {{date-1M}}', at(day(2026, 0, 31)))).toBe('2026-02-28 2025-12-31');
    expect(fillTemplate('{{date+1y}}', at(day(2028, 1, 29)))).toBe('2029-02-28');
    expect(fillTemplate('[[{{date+1M:MM.YY [RPG]}}]]', at(day(2026, 0, 31)))).toBe('[[02.26 RPG]]');
  });
});
