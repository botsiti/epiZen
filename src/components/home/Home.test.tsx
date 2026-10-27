import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { day, sameDay } from '../../lib/dates';
import { parseDay } from '../../lib/day';
import type { Shelf } from '../../lib/media';
import type { DayEntry } from '../../lib/rollup';
import { Home, type HomeProps } from './Home';

vi.mock('../../lib/api', () => ({ readImage: vi.fn(() => Promise.resolve(new ArrayBuffer(0))) }));

// Numbers show their value at once, as in the e2e run.
beforeAll(() => {
  document.documentElement.dataset.motion = 'off';
});

// demo-vault/Calendar/2026/days 2026/29.09.2026.md and 28.09.2026.md, shortened.
const SEP_29 = `---
done: 83
sleep: 7.8
focus: 3
energy: 2
mood: 3
soc: 3
---

### Tasks
- [x] #daily/dog — long walk with the dog [minutes::41]
    - 08:50–09:31
- [x] #daily/code — fix the login bug [minutes::42]
    - 09:52–10:34
- [ ] #daily/code — review a pull request [minutes::24]
    - 14:14–14:38
`;
const SEP_28 = `---
sleep: 6.8
focus: 3
energy: 2
mood: 5
soc: 4
---

### Tasks
- [x] #daily/business — write the pitch for the grant [minutes::60]
    - 09:00–10:00
`;

const TODAY = day(2026, 8, 29);
const DAYS: DayEntry[] = [
  { date: day(2026, 8, 28), path: 'Calendar/28.09.2026.md', day: parseDay(SEP_28) },
  { date: TODAY, path: 'Calendar/29.09.2026.md', day: parseDay(SEP_29) },
];
const SHELVES: Shelf[] = [
  {
    folder: 'Rating/music',
    items: [
      { path: 'Rating/music/Glasshouse Weather.md', title: 'Glasshouse Weather', subtitle: 'Mira Okonkwo', rating: 88, date: '2026-08-10' },
      { path: 'Rating/music/Old.md', title: 'Old', rating: 70, date: '2025-05-01' },
    ],
  },
];

const props = (overrides: Partial<HomeProps> = {}): HomeProps => ({
  vaultName: 'demo-vault',
  stats: { notes: 106, folders: 10, images: 27 },
  today: TODAY,
  todayNote: { name: '29.09.2026', path: 'Calendar/29.09.2026.md' },
  days: DAYS,
  dayOf: (date) => DAYS.find((entry) => sameDay(entry.date, date)) ?? { date },
  exists: (period) => period === 'day',
  scales: { mood: 5, energy: 5, focus: 5, soc: 5 },
  shelves: SHELVES,
  onOpenNote: vi.fn(),
  onOpenPeriod: vi.fn(),
  ...overrides,
});

describe('the homepage', () => {
  it('shows the level, streak, life XP and today in the hero, with the vault and its counts', () => {
    render(<Home {...props()} />);
    // 41 + 42 + 24 + 60 minutes, all at 1 XP a minute.
    expect(screen.getByTestId('hero-title')).toHaveTextContent('Level 1');
    expect(screen.getByTestId('rank')).toHaveTextContent('Novice · Kaizen profile');
    const stats = screen.getByTestId('hero-stats');
    expect(stats).toHaveTextContent('Life XP167');
    expect(stats).toHaveTextContent('Streak2dbest 2d');
    expect(stats).toHaveTextContent('Today2/3');
    expect(screen.getByTestId('vault-name')).toHaveTextContent(/^demo-vault$/);
    expect(screen.getByTestId('home')).toHaveTextContent('106 notes · 10 folders · 27 images');
  });

  it('counts the year and month, and asks for a birth date before counting the weeks', () => {
    render(<Home {...props()} />);
    const memento = screen.getByTestId('memento');
    expect(memento).toHaveTextContent('Add your birth date in Settings to count the weeks.');
    expect(memento).not.toHaveTextContent('Till 30');
  });

  it('counts life till 30 from the birth date, and opens the weeks on a click', async () => {
    const user = userEvent.setup();
    render(<Home {...props({ birthDate: day(1998, 2, 21) })} />);
    const memento = screen.getByTestId('memento');
    expect(memento).toHaveTextContent('Till 30');
    expect(memento).toHaveTextContent('539 days · 1.48 y left');
    expect(screen.queryByTestId('weeks-grid')).toBeNull();
    await user.click(screen.getByTestId('weeks-toggle'));
    expect(screen.getByTestId('weeks-grid').querySelectorAll('rect')).toHaveLength(1560);
    expect(screen.getByTestId('weeks-grid').querySelectorAll('rect.is-now')).toHaveLength(1);
  });

  it("lists today's tasks and opens today's, this week's and this month's notes", async () => {
    const user = userEvent.setup();
    const onOpenPeriod = vi.fn();
    render(<Home {...props({ onOpenPeriod })} />);
    const today = screen.getByTestId('today');
    expect(today).toHaveTextContent('2/3 done');
    expect(within(today).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByTestId('today-open')).toHaveAttribute('title', 'Open 29.09.2026');
    await user.click(screen.getByTestId('today-open'));
    await user.click(screen.getByTestId('today-week'));
    await user.click(screen.getByTestId('today-month'));
    expect(onOpenPeriod.mock.calls).toEqual([
      ['day', TODAY],
      ['week', day(2026, 8, 28)],
      ['month', day(2026, 8, 1)],
    ]);
  });

  it('offers to create today’s note when there is none', () => {
    render(<Home {...props({ today: day(2026, 8, 30), todayNote: { name: '30.09.2026' } })} />);
    expect(screen.getByTestId('today-create')).toHaveAttribute('title', expect.stringContaining('creates it from its template'));
    expect(screen.getByTestId('today')).toHaveTextContent('No daily note for today yet.');
  });

  it('draws seven days of focus, and opens a day that has a note', async () => {
    const user = userEvent.setup();
    const onOpenNote = vi.fn();
    render(<Home {...props({ onOpenNote })} />);
    const bars = screen.getAllByTestId('focus-day');
    expect(bars).toHaveLength(7);
    expect(screen.getByTestId('focus')).toHaveTextContent('2h 47m · 24m a day');
    // The panel opens on today, the latest day with time logged.
    expect(screen.getByTestId('focus-detail')).toHaveTextContent('code1h 6m');
    await user.click(bars[0] as HTMLElement);
    expect(onOpenNote).not.toHaveBeenCalled();
    await user.click(bars[5] as HTMLElement);
    expect(onOpenNote).toHaveBeenCalledWith('Calendar/28.09.2026.md');
  });

  it('levels the life spheres, and leads with the one with the most XP', () => {
    render(<Home {...props()} />);
    const spheres = screen.getByTestId('spheres');
    expect(within(spheres).getAllByRole('listitem')).toHaveLength(8);
    // Code's 66 and half of business's 60.
    expect(spheres.querySelector('[data-sphere="Career/Work"]')).toHaveTextContent('96 XP');
    expect(screen.getByTestId('lead-sphere')).toHaveTextContent('Career/Work');
    expect(screen.getByTestId('sport-floor')).toHaveTextContent('0 / 150 min');
  });

  it("shows the shelves with this year's count", async () => {
    const user = userEvent.setup();
    const onOpenNote = vi.fn();
    render(<Home {...props({ onOpenNote })} />);
    expect(screen.getByTestId('shelf')).toHaveTextContent('2 rated · 1 this year');
    await user.click(screen.getAllByTestId('cover-card')[0] as HTMLElement);
    expect(onOpenNote).toHaveBeenCalledWith('Rating/music/Glasshouse Weather.md');
  });
});
