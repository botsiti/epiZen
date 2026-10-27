import { describe, expect, it } from 'vitest';
import { activeIn, artPaths, deadlineMultiplier, earned, parseQuests, penalty, questSphereXp, questXp, setQuestProgress, tierOf, toggleQuest } from './quests';

// Quest lines in the vault's format (invented quests), as a monthly note and Custom Quests.md hold them.
const MONTH = `### Quest XP
- [ ] #quest/monthly - 12 videos public [xp::1000] [spheres::Career/Work, Personal Growth:30] [tier::epic] [target::12] [current::3] [desc::Three a week.]
    - 03.10.2026 :: First one up.
    - 03.10.2026 :: +83 XP
- [x] #quest/monthly - Ship the beta [xp::500] [spheres::Career/Work] [done::2026-10-20]
- [ ] #quest/weekly #daily/business - 2 calls [xp::300] [tier::rare]

### Plans for month
- [ ] not a quest
`;

const CUSTOM = `# Custom Quests

- [ ] #quest/custom - Finish the novel [xp::4200] [spheres::Personal Growth] [start::2026-09-15] [deadline::2026-10-31] [target::3] [current::1] [image::Templates/quest-art/_custom epic.png]
    - 15.09.2026 :: The first page.
`;

describe('parseQuests', () => {
  const [videos, beta, calls] = parseQuests('m.md', MONTH);
  const [novel] = parseQuests('c.md', CUSTOM);

  it('reads scope, title, fields, spheres and the log', () => {
    expect(videos).toMatchObject({
      line: 1,
      scope: 'monthly',
      title: '12 videos public',
      xp: 1000,
      tier: 'epic',
      spheres: [
        { name: 'Career/Work', weight: 100 },
        { name: 'Personal Growth', weight: 30 },
      ],
      target: 12,
      current: 3,
      done: false,
      desc: 'Three a week.',
    });
    expect(videos?.log).toEqual([
      { line: 2, date: '03.10.2026', text: 'First one up.', xp: undefined },
      { line: 3, date: '03.10.2026', text: '+83 XP', xp: 83 },
    ]);
  });

  it('infers a tier from the XP, keeps a second tag out of the title, and reads mythic quests', () => {
    expect(beta).toMatchObject({ title: 'Ship the beta', tier: 'rare', done: true, doneOn: '2026-10-20' });
    expect(calls).toMatchObject({ scope: 'weekly', title: '2 calls', tier: 'rare' });
    expect(novel).toMatchObject({ scope: 'custom', tier: 'epic', start: '2026-09-15', deadline: '2026-10-31', image: 'Templates/quest-art/_custom epic.png' });
    expect(parseQuests('x.md', MONTH)).toHaveLength(3);
  });

  it('counts a counter at its target as done, ticked or not', () => {
    const [over] = parseQuests('m.md', '- [ ] #quest/monthly - 150 comments [xp::600] [target::150] [current::191]\n');
    expect(over?.done).toBe(true);
    expect(over?.checked).toBe(false);
  });
});

describe('XP', () => {
  const [videos, beta] = parseQuests('m.md', MONTH);
  if (!videos || !beta) throw new Error('no quests');

  it('infers tiers at 300, 700 and 1500', () => {
    expect([299, 300, 700, 1500].map(tierOf)).toEqual(['common', 'rare', 'epic', 'legendary']);
  });

  it('pays each sphere its weight, curved by progress', () => {
    // 3 of 12 is a quarter; a quarter to the 2.5th power is 1/32.
    expect(earned(videos)).toBe(Math.round(1000 / 32) + Math.round((300 * 1) / 32));
    expect(earned(beta)).toBe(500);
  });

  it('scales by an explicit deadline: early, on time, late', () => {
    const quest = (done: string) => parseQuests('c.md', `- [x] #quest/custom - Q [xp::1000] [deadline::2026-10-31] [done::${done}]\n`)[0];
    expect([quest('2026-10-20'), quest('2026-10-31'), quest('2026-11-02')].map((q) => q && deadlineMultiplier(q))).toEqual([1.25, 1, 0.7]);
  });

  it('takes a penalty from an open quest past its time, by its tier', () => {
    const october = { from: new Date(2026, 9, 1), to: new Date(2026, 10, 1) };
    expect(penalty(videos, '2026-10-31', october)).toBe(0);
    expect(penalty(videos, '2026-11-01', october)).toBe(Math.round(1000 * 0.15 * 1.5));
    expect(penalty(beta, '2026-12-01', october)).toBe(0);
  });

  it('knows when a mythic quest runs', () => {
    const [novel] = parseQuests('c.md', CUSTOM);
    if (!novel) throw new Error('no quest');
    expect(activeIn(novel, '2026-10-01', '2026-10-31')).toBe(true);
    expect(activeIn(novel, '2026-11-01', '2026-11-30')).toBe(false);
  });

  it('looks for art by its own image, then by its main sphere', () => {
    expect(artPaths(videos)[0]).toBe('Templates/quest-art/_career-work.png');
    const [novel] = parseQuests('c.md', CUSTOM);
    if (!novel) throw new Error('no quest');
    expect(artPaths(novel)[0]).toBe('Templates/quest-art/_custom epic.png');
  });
});

describe('questXp and questSphereXp', () => {
  const october = { from: new Date(2026, 9, 1), to: new Date(2026, 10, 1) };
  const entries = parseQuests('m.md', MONTH).map((quest) => ({ quest, period: october }));

  it('adds what quests earned, less what open ones lost past their month', () => {
    const earnedAll = entries.reduce((sum, { quest }) => sum + earned(quest), 0);
    expect(questXp(entries, '2026-10-15')).toBe(earnedAll);
    // In November the open counter (epic) and the open weekly (rare) are past their month.
    expect(questXp(entries, '2026-11-02')).toBe(earnedAll - Math.round(1000 * 0.15 * 1.5) - Math.round(300 * 0.25 * 1));
  });

  it('gives each sphere its weighted share', () => {
    const xp = questSphereXp(entries);
    expect(xp.get('Career/Work')).toBe(Math.round(1000 / 32) + 500);
    expect(xp.get('Personal Growth')).toBe(Math.round(300 / 32));
  });
});

const changed = (before: string, after: string) => {
  const a = before.split('\n');
  const b = after.split('\n');
  return { removed: a.filter((line) => !b.includes(line)), added: b.filter((line) => !a.includes(line)) };
};

describe('toggleQuest', () => {
  const today = new Date(2026, 9, 27);

  it('ticks a quest: its box, its done date, and today\'s XP stamp, and nothing else', () => {
    const [, , calls] = parseQuests('m.md', MONTH);
    if (!calls) throw new Error('no quest');
    const after = toggleQuest(MONTH, calls, today);
    expect(changed(MONTH, after)).toEqual({
      removed: ['- [ ] #quest/weekly #daily/business - 2 calls [xp::300] [tier::rare]'],
      added: ['- [x] #quest/weekly #daily/business - 2 calls [xp::300] [tier::rare] [done::2026-10-27]', '    - 27.10.2026 :: +300 XP'],
    });
  });

  it('reopening takes the done date and today\'s stamp back out', () => {
    const [, , calls] = parseQuests('m.md', MONTH);
    if (!calls) throw new Error('no quest');
    const ticked = toggleQuest(MONTH, calls, today);
    const [, , again] = parseQuests('m.md', ticked);
    if (!again) throw new Error('no quest');
    expect(toggleQuest(ticked, again, today)).toBe(MONTH);
  });

  it('completes a counter at its target, stamping what is left of its XP', () => {
    const [videos] = parseQuests('m.md', MONTH);
    if (!videos) throw new Error('no quest');
    const after = toggleQuest(MONTH, videos, today);
    expect(after.split('\n')[1]).toBe(videos.raw.replace('[ ]', '[x]').replace('[current::3]', '[current::12]').replace('[desc::Three a week.]', '[desc::Three a week.] [done::2026-10-27]'));
    expect(after.split('\n')[4]).toBe('    - 27.10.2026 :: +750 XP');
  });

  it('keeps CRLF and refuses a line that changed', () => {
    const crlf = MONTH.replace(/\n/g, '\r\n');
    const [, , calls] = parseQuests('m.md', crlf);
    if (!calls) throw new Error('no quest');
    expect(toggleQuest(crlf, calls, today)).toBe(toggleQuest(MONTH, calls, today).replace(/\n/g, '\r\n'));
    expect(() => toggleQuest(MONTH.replace('2 calls', '3 calls'), calls, today)).toThrow(/changed/);
  });
});

describe('setQuestProgress', () => {
  const [videos] = parseQuests('m.md', MONTH);
  if (!videos) throw new Error('no quest');

  it('moves the counter and merges the change into the day\'s stamp', () => {
    const after = setQuestProgress(MONTH, videos, 5, new Date(2026, 9, 3));
    const lines = after.split('\n');
    expect(lines[1]).toBe(videos.raw.replace('[current::3]', '[current::5]'));
    // Two more of twelve: 1000 × 2/12 ≈ 167 more on 3 October's stamp of 83.
    expect(lines[3]).toBe('    - 03.10.2026 :: +250 XP');
    expect(lines).toHaveLength(MONTH.split('\n').length);
  });

  it('clamps to the target, ticking it there; a step back unticks it', () => {
    const full = setQuestProgress(MONTH, videos, 40, new Date(2026, 9, 5));
    expect(full.split('\n')[1]).toMatch(/^- \[x\] .*\[current::12\].*\[done::2026-10-05\]$/);
    const [again] = parseQuests('m.md', full);
    if (!again) throw new Error('no quest');
    const back = setQuestProgress(full, again, 11, new Date(2026, 9, 5));
    expect(back.split('\n')[1]).toBe(videos.raw.replace('[current::3]', '[current::11]'));
  });

  it('refuses a quest without a counter', () => {
    const [, beta] = parseQuests('m.md', MONTH);
    if (!beta) throw new Error('no quest');
    expect(() => setQuestProgress(MONTH, beta, 1, new Date())).toThrow(/counter/);
  });
});
