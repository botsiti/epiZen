import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { day, sameDay } from '../../lib/dates';
import { parseDay } from '../../lib/day';
import type { MediaEntry } from '../../lib/library';
import type { DayEntry } from '../../lib/rollup';
import { editQuestPreferences, newQuestArea, saveQuestPreferences } from '../../lib/questPreferences';
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
const LIBRARY: MediaEntry[] = [
  { path: 'Rating/music/Glasshouse Weather.md', title: 'Glasshouse Weather', kind: 'album', maker: 'Mira Okonkwo', rating: 88, date: '2026-08-10', genres: [], tracks: [] },
  { path: 'Rating/music/Old.md', title: 'Old', kind: 'album', rating: 70, date: '2025-05-01', genres: [], tracks: [] },
];

const props = (overrides: Partial<HomeProps> = {}): HomeProps => ({
  vaultName: 'demo-vault',
  stats: { notes: 106, folders: 10, images: 27 },
  today: TODAY,
  todayNote: { name: '29.09.2026', path: 'Calendar/29.09.2026.md' },
  days: DAYS,
  dayOf: (date) => DAYS.find((entry) => sameDay(entry.date, date)) ?? { date },
  exists: (period) => period === 'day',
  quests: [],
  art: () => undefined,
  onQuestToggle: vi.fn(),
  onQuestProgress: vi.fn(),
  scales: { mood: 5, energy: 5, focus: 5, soc: 5 },
  library: LIBRARY,
  onSeeLibrary: vi.fn(),
  onSeeQuests: vi.fn(),
  onSeeStatistics: vi.fn(),
  onSeeSummaries: vi.fn(),
  onOpenNote: vi.fn(),
  onOpenPeriod: vi.fn(),
  ...overrides,
});

describe('the homepage', () => {
  it('shows the level, streak, life XP and today in the hero, with the vault and its counts', () => {
    render(<Home {...props()} />);
    // 41 + 42 + 24 + 60 minutes, all at 1 XP a minute.
    expect(screen.getByTestId('hero-title')).toHaveTextContent('Level 1');
    expect(screen.getByTestId('rank')).toHaveTextContent(/^Novice$/);
    const stats = screen.getByTestId('hero-stats');
    expect(stats).toHaveTextContent('Life XP167');
    expect(stats).toHaveTextContent('Streak2dbest 2d');
    expect(stats).toHaveTextContent('Today2/3');
    expect(screen.getByTestId('vault-name')).toHaveTextContent(/^demo-vault$/);
    expect(screen.getByTestId('home')).toHaveTextContent('106 notes · 10 folders · 27 images');
  });

  it('shows year and month before a birth date is supplied', () => {
    render(<Home {...props()} />);
    expect(screen.getByTestId('memento')).toHaveTextContent('Add your birth date');
    expect(screen.getByTestId('memento').querySelectorAll('li')).toHaveLength(2);
  });

  it('shows a single lifetime row with the chosen horizon and percentage', () => {
    render(<Home {...props({ birthDate: day(1986, 8, 29), lifetimeYears: 100 })} />);
    const memento = screen.getByTestId('memento');
    expect(memento).toHaveTextContent('100-year lifetime');
    expect(memento.querySelector('[data-span="Lifetime"]')).toHaveTextContent('40.0%');
    expect(memento.querySelectorAll('li')).toHaveLength(3);
    expect(within(memento).queryByRole('button')).toBeNull();
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
    expect(screen.getByTestId('today-create')).toHaveAttribute('title', expect.stringContaining('creates it with built-in starting text'));
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

  it('names no lead sphere before any time is logged, and still shows the sport floor', () => {
    render(<Home {...props({ days: [], dayOf: (date) => ({ date }) })} />);
    const lead = screen.getByTestId('lead-sphere');
    expect(lead).toHaveTextContent('No XP yet.');
    expect(lead).not.toHaveTextContent('Career/Work');
    expect(screen.getByTestId('sport-floor')).toHaveTextContent('0 / 150 min');
    expect(screen.getByTestId('hero-title')).toHaveTextContent('Level 1');
  });

  it('shows at most ten recent library items and opens the library', async () => {
    const user = userEvent.setup();
    const onOpenNote = vi.fn();
    const onSeeLibrary = vi.fn();
    const extra = Array.from({ length: 10 }, (_, i): MediaEntry => ({ path: `new-${i}`, title: `New ${i}`, kind: 'film', date: '2026-09-01', genres: [], tracks: [] }));
    render(<Home {...props({ library: [...LIBRARY, ...extra], onOpenNote, onSeeLibrary })} />);
    const recent = screen.getByTestId('recent-library');
    expect(within(recent).getAllByTestId('cover-card')).toHaveLength(10);
    expect(within(recent).getAllByRole('img', { name: 'Film' })).toHaveLength(10);
    expect(within(recent).queryByText('Old')).not.toBeInTheDocument();
    await user.click(within(recent).getByRole('button', { name: 'See all →' }));
    expect(onSeeLibrary).toHaveBeenCalled();
    await user.click(within(recent).getAllByTestId('cover-card')[0] as HTMLElement);
    expect(onOpenNote).toHaveBeenCalled();
  });
});

it('shows a saved zero-XP sphere, exposes previous credit in history, and opens sphere settings', async () => {
  const user = userEvent.setup(), onEdit = vi.fn();
  const draft = editQuestPreferences(undefined, 0, '2026-11-18');
  draft.areas = [...draft.areas.map((area) => area.id === 'career-work' ? { ...area, archived: true } : area),
    { ...newQuestArea('music', 0), name: 'Music' }];
  render(<Home {...props({ rewards: saveQuestPreferences(draft), onEditSpheres: onEdit })} />);
  const card = screen.getByTestId('spheres');
  expect(card.querySelector('[data-sphere="Music"]')).toHaveTextContent('0 XP');
  expect(card.querySelector('[data-sphere="Career/Work"]')).toBeNull();
  expect(screen.getByTestId('lead-sphere')).not.toHaveTextContent('Career/Work');
  await user.click(within(card).getByText('Archived spheres (1)'));
  expect(within(card).getByText('Career/Work')).toBeVisible();
  await user.click(within(card).getByRole('button', { name: 'Edit life spheres' }));
  expect(onEdit).toHaveBeenCalledOnce();
});
