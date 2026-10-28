import { describe, expect, it } from 'vitest';
import {
  activeIn,
  addChapter,
  addQuest,
  artPaths,
  bonusWeight,
  changeQuest,
  deadlineMultiplier,
  deleteChapter,
  earned,
  editChapter,
  parseQuests,
  penalty,
  questLine,
  questSphereXp,
  questXp,
  setDeadline,
  setQuestProgress,
  sphereXp,
  stepWeight,
  tierOf,
  toggleQuest,
  toggleSphere,
  type NewQuest,
} from './quests';

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

// The vault's Obsidian scripts write new quests, chapters and deadlines with these, copied as they
// are from Templates/Scripts (rpg-week.js: questLine, appendToQuestSection; rpg-shared.js:
// addQuestNote and updateQuestField, without the file reading around them). Epizen writes what
// they write.
const LIFE_SPHERES = ['Spiritual', 'Career/Work', 'Love/Relationship', 'Health/Fitness', 'Personal Growth', 'Fun/Recreation', 'Social', 'Finance'];
const obsidian = {
  escapeQuestField: (value: string) => String(value || '').replace(/\]/g, ')').replace(/\r?\n/g, ' ').trim(),
  questLine({ spheres, xp, tier, text, target, current, scope }: { spheres: { sphere: string; weight: number }[]; xp: number; tier: string; text: string; target: number; current: number; scope: string }) {
    const cleanXP = Math.max(0, Math.round(Number(xp) || 0));
    const cleanScope = scope === 'monthly' ? 'monthly' : 'weekly';
    const targetN = Math.max(0, Math.round(Number(target) || 0));
    const currentN = Math.max(0, Math.round(Number(current) || 0));
    const progressFields = targetN > 0 ? ` [target::${targetN}] [current::${currentN}]` : '';
    const tierField = tier ? ` [tier::${tier}]` : '';
    const spheresEncoded = spheres
      .map((entry, index) => {
        const name = LIFE_SPHERES.includes(entry.sphere) ? entry.sphere : 'Personal Growth';
        if (index === 0) return name;
        const weight = Math.max(0, Math.round(Number(entry.weight) || 30));
        return `${name}:${weight}`;
      })
      .join(', ');
    return `- [ ] #quest/${cleanScope} - ${obsidian.escapeQuestField(text) || 'Untitled quest'} [xp::${cleanXP}] [spheres::${spheresEncoded}]${tierField}${progressFields}`;
  },
  appendToQuestSection(text: string, line: string) {
    const source = String(text || '');
    const lines = source.split(/\r?\n/);
    const heading = lines.findIndex((row) => /^###\s+Quest XP\s*$/i.test(row.trim()));
    if (heading === -1) return `${source.trimEnd()}\n\n### Quest XP\n${line}\n`;
    let insertAt = heading + 1;
    for (let i = heading + 1; i < lines.length; i++) {
      const trimmed = (lines[i] ?? '').trim();
      if (/^#+\s+/.test(trimmed)) break;
      if (/^[-*]\s*\[[ xX]\]/.test(trimmed)) {
        insertAt = i + 1;
        continue;
      }
      if (/^\s+[-*]\s+/.test(lines[i] ?? '')) {
        insertAt = i + 1;
        continue;
      }
      if (trimmed === '') continue;
      break;
    }
    lines.splice(insertAt, 0, line);
    return lines.join('\n').replace(/\n{4,}/g, '\n\n\n');
  },
  addQuestNote(text: string, target: number, noteText: string, stamp: string) {
    const lines = text.split(/\r?\n/);
    let insertAt = target + 1;
    while (insertAt < lines.length && /^\s+-\s+/.test(lines[insertAt] ?? '')) insertAt++;
    const clean = String(noteText || '').replace(/\r?\n+/g, ' ').trim();
    lines.splice(insertAt, 0, '    - ' + stamp + ' :: ' + clean);
    return lines.join('\n');
  },
  updateQuestField(text: string, targetIndex: number, fieldName: string, value: string) {
    const lines = text.split(/\r?\n/);
    const v = String(value == null ? '' : value).trim().replace(/[[\]]/g, '');
    let line = lines[targetIndex] ?? '';
    const fieldRe = new RegExp('\\s*\\[' + fieldName + '::[^\\]]*\\]', 'i');
    if (v === '') line = line.replace(fieldRe, '');
    else if (fieldRe.test(line)) line = line.replace(fieldRe, ' [' + fieldName + '::' + v + ']');
    else line = line + ' [' + fieldName + '::' + v + ']';
    lines[targetIndex] = line.replace(/\s+$/, '');
    return lines.join('\n');
  },
};

// demo-vault/Calendar/2026/weeks/2026-W40 - 28.09.26.md, its Quest XP section and the heading after.
const W40 = `### Quest XP
- [ ] #quest/weekly - Three deep-work mornings [xp::300] [spheres::Career/Work] [tier::rare] [target::3] [current::1]
    - 29.09.2026 :: Two hours before the phone.
    - 29.09.2026 :: Two hours before the phone.
- [ ] #quest/weekly - Two long runs [xp::300] [spheres::Health/Fitness] [tier::rare] [target::2] [current::0]
Add real weekly quests with the **+ New quest** button in the Quests tab.

#### Plus
`;
// demo-vault/Calendar/2026/months 2026/09.26 RPG.md, its Quest XP section and the heading after.
const SEPTEMBER = `### Quest XP
- [ ] #quest/monthly - Launch the beta [xp::1000] [spheres::Career/Work, Finance:30] [tier::epic]
- [ ] #quest/monthly - 12 English lessons [xp::700] [spheres::Personal Growth] [tier::epic] [target::12] [current::7]

### Plans for month
`;
// demo-vault/Calendar/Custom Quests.md.
const MYTHIC = `# Custom Quests

- [ ] #quest/custom - Finish the novel draft [xp::4200] [spheres::Personal Growth] [tier::epic] [start::2026-08-01] [deadline::2026-12-31] [target::3] [current::1] [desc::Three acts, a page a day. The first act is done.]
    - 01.08.2026 :: Started with the ending.
    - 12.09.2026 :: Act one done.
- [ ] #quest/custom - Run a half marathon [xp::3000] [spheres::Health/Fitness] [tier::legendary] [start::2026-08-15] [deadline::2026-11-15] [desc::Twenty-one kilometres before the cold comes.]
`;
const DAY = new Date(2026, 8, 30);
/** The item at that place, which the test knows is there. */
function nth<T>(list: readonly T[], i: number): T {
  const item = list[i];
  if (item === undefined) throw new Error(`nothing at ${i}`);
  return item;
}

describe('the life sphere picker', () => {
  it('makes the first pick main, the rest bonuses at 30%, and the next one main when the main one goes', () => {
    let list = toggleSphere([], 'Career/Work');
    list = toggleSphere(list, 'Finance');
    list = toggleSphere(list, 'Social');
    expect(list).toEqual([
      { name: 'Career/Work', weight: 100 },
      { name: 'Finance', weight: 30 },
      { name: 'Social', weight: 30 },
    ]);
    expect(toggleSphere(list, 'Career/Work')).toEqual([
      { name: 'Finance', weight: 100 },
      { name: 'Social', weight: 30 },
    ]);
  });

  it('steps a bonus to the neighbouring ten, from 5 to 100, and pays it its share on top', () => {
    expect([stepWeight(25, 1), stepWeight(25, -1), stepWeight(10, -1), stepWeight(100, 1)]).toEqual([30, 20, 5, 100]);
    expect([bonusWeight(Number.NaN), bonusWeight(2), bonusWeight(140)]).toEqual([30, 5, 100]);
    expect(sphereXp(500, 30)).toBe(150);
  });
});

describe('questLine', () => {
  const quest = (patch: Partial<NewQuest> = {}): NewQuest => ({ scope: 'weekly', title: 'Two long runs', xp: 500, tier: 'rare', spheres: [{ name: 'Health/Fitness', weight: 100 }], target: 0, ...patch });

  it("writes the line the dashboards' composers write", () => {
    const cases: NewQuest[] = [
      quest(),
      quest({ scope: 'monthly', title: 'Launch the beta', xp: 1000, tier: 'epic', spheres: [{ name: 'Career/Work', weight: 100 }, { name: 'Finance', weight: 30 }] }),
      quest({ title: ' Read [150] pages\n', xp: 299.6, tier: 'common', target: 150 }),
    ];
    for (const one of cases) {
      expect(questLine(one)).toBe(
        obsidian.questLine({ spheres: one.spheres.map(({ name, weight }) => ({ sphere: name, weight })), xp: one.xp, tier: one.tier, text: one.title, target: one.target, current: 0, scope: one.scope }),
      );
    }
    expect(questLine(cases[2] as NewQuest)).toBe('- [ ] #quest/weekly - Read [150) pages [xp::300] [spheres::Health/Fitness] [tier::common] [target::150] [current::0]');
    const [read] = parseQuests('w.md', questLine(cases[1] as NewQuest));
    expect(read).toMatchObject({ scope: 'monthly', title: 'Launch the beta', xp: 1000, tier: 'epic', spheres: [{ name: 'Career/Work', weight: 100 }, { name: 'Finance', weight: 30 }] });
  });

  it('refuses a quest without words, without a sphere, or with one the vault has no colour for', () => {
    expect(() => questLine(quest({ title: '  ' }))).toThrow('counts as done');
    expect(() => questLine(quest({ spheres: [] }))).toThrow('life sphere');
    expect(() => questLine(quest({ spheres: [{ name: 'Hobbies', weight: 100 }] }))).toThrow('Hobbies');
    expect(() => questLine(quest({ spheres: [{ name: 'Social', weight: 100 }, { name: 'Social', weight: 30 }] }))).toThrow('once');
  });
});

describe('addQuest', () => {
  const line = '- [ ] #quest/weekly - Read 100 pages [xp::300] [spheres::Personal Growth] [tier::rare] [target::100] [current::0]';

  it('adds the quest after the last quest and its log, before the hint, as the dashboards do', () => {
    expect(addQuest(W40, line)).toBe(W40.replace('[current::0]\nAdd real', `[current::0]\n${line}\nAdd real`));
    expect(addQuest(W40, line)).toBe(obsidian.appendToQuestSection(W40, line));
    expect(addQuest(SEPTEMBER, line)).toBe(obsidian.appendToQuestSection(SEPTEMBER, line));
    expect(addQuest('### Quest XP\n\n#### Plus\n', line)).toBe(`### Quest XP\n${line}\n\n#### Plus\n`);
  });

  it('adds a Quest XP heading at the end of a note without one, and keeps CRLF', () => {
    const plain = '#### Plus\n- Shipped\n';
    expect(addQuest(plain, line)).toBe(obsidian.appendToQuestSection(plain, line));
    const crlf = SEPTEMBER.replace(/\n/g, '\r\n');
    expect(addQuest(crlf, line)).toBe(crlf.replace('[current::7]\r\n', `[current::7]\r\n${line}\r\n`));
  });

  it('refuses what is not one quest line, and a note that mixes line endings', () => {
    expect(() => addQuest(W40, '- [ ] a task')).toThrow('one quest line');
    expect(() => addQuest(W40, `${line}\n${line}`)).toThrow('one quest line');
    expect(() => addQuest('### Quest XP\r\n\n', line)).toThrow('mixes line endings');
  });
});

describe('the adventure log', () => {
  const [mornings, runs] = parseQuests('w.md', W40);
  const [novel] = parseQuests('c.md', MYTHIC);
  if (!mornings || !runs || !novel) throw new Error('no quests');

  it('adds a chapter dated today after the log, as the modal does', () => {
    const added = addChapter(W40, mornings, 'Third\nmorning, no phone. ', DAY);
    expect(added).toBe(W40.replace('phone.\n- [ ] #quest/weekly - Two', 'phone.\n    - 30.09.2026 :: Third morning, no phone.\n- [ ] #quest/weekly - Two'));
    expect(added).toBe(obsidian.addQuestNote(W40, mornings.line, 'Third\nmorning, no phone. ', '30.09.2026'));
    expect(addChapter(W40, runs, 'First run', DAY)).toBe(obsidian.addQuestNote(W40, runs.line, 'First run', '30.09.2026'));
    expect(parseQuests('c.md', addChapter(MYTHIC, novel, 'Act two begun.', DAY))[0]?.log.map((entry) => entry.text)).toEqual(['Started with the ending.', 'Act one done.', 'Act two begun.']);
    expect(() => addChapter(W40, mornings, ' \n ', DAY)).toThrow('Write what happened');
  });

  it('rewrites a chapter in place, keeping its bullet and date, and takes one out', () => {
    const [first, second] = novel.log;
    if (!first || !second) throw new Error('no chapters');
    expect(editChapter(MYTHIC, novel, second, 'Act one done, at last.')).toBe(MYTHIC.replace('12.09.2026 :: Act one done.', '12.09.2026 :: Act one done, at last.'));
    expect(deleteChapter(MYTHIC, novel, first)).toBe(MYTHIC.replace('    - 01.08.2026 :: Started with the ending.\n', ''));
    expect(changeQuest(MYTHIC, novel, { kind: 'delete-chapter', entry: first }, DAY)).toBe(deleteChapter(MYTHIC, novel, first));
  });

  it('tells two chapters alike apart by their order: the second is the second line', () => {
    const [, twin] = mornings.log;
    if (!twin) throw new Error('no twin');
    const lines = editChapter(W40, mornings, twin, 'Two hours, then the phone.').split('\n');
    expect(lines.slice(1, 4)).toEqual([mornings.raw, '    - 29.09.2026 :: Two hours before the phone.', '    - 29.09.2026 :: Two hours, then the phone.']);
  });

  it('finds a chapter again by order when the log has moved under it since it was shown, never by the nearest line', () => {
    // The log as shown: one chapter, then two alike after it. The first is taken out on disk first.
    const shownText = addChapter(addChapter(editChapter(W40, mornings, nth(mornings.log, 0), 'Up at six.'), mornings, 'Wrote first.', DAY), mornings, 'Wrote first.', DAY);
    const shown = nth(parseQuests('w.md', shownText), 0);
    expect(shown.log.map((entry) => entry.text)).toEqual(['Up at six.', 'Two hours before the phone.', 'Wrote first.', 'Wrote first.']);
    const onDisk = deleteChapter(shownText, shown, nth(shown.log, 0));
    // Still showing the old log, the first of the two alike is rewritten: on disk it is now one line up.
    const lines = editChapter(onDisk, shown, nth(shown.log, 2), 'Wrote first, then ran.').split('\n');
    expect(lines.slice(2, 5)).toEqual(['    - 29.09.2026 :: Two hours before the phone.', '    - 30.09.2026 :: Wrote first, then ran.', '    - 30.09.2026 :: Wrote first.']);
    // A chapter that is gone is refused.
    expect(() => editChapter(onDisk, shown, nth(shown.log, 0), 'x')).toThrow('changed in its note');
  });

  it("leaves XP stamps to the quest's tick and counter, and refuses a quest that has changed", () => {
    const [beta] = parseQuests('m.md', '- [x] #quest/monthly - Ship the beta [xp::500] [done::2026-10-20]\n    - 20.10.2026 :: +500 XP\n');
    const stamp = beta?.log[0];
    if (!beta || !stamp) throw new Error('no stamp');
    expect(() => deleteChapter('- [x] #quest/monthly - Ship the beta [xp::500] [done::2026-10-20]\n    - 20.10.2026 :: +500 XP\n', beta, stamp)).toThrow('XP stamp');
    expect(() => addChapter(W40.replace('[current::1]', '[current::2]'), mornings, 'x', DAY)).toThrow('changed in its note');
  });
});

describe('setDeadline', () => {
  const [mornings] = parseQuests('w.md', W40);
  const [novel] = parseQuests('c.md', MYTHIC);
  if (!mornings || !novel) throw new Error('no quests');

  it('adds, moves and takes out the deadline as the modal does', () => {
    expect(setDeadline(W40, mornings, '2026-10-02')).toBe(W40.replace('[current::1]\n', '[current::1] [deadline::2026-10-02]\n'));
    expect(setDeadline(W40, mornings, '2026-10-02')).toBe(obsidian.updateQuestField(W40, mornings.line, 'deadline', '2026-10-02'));
    expect(setDeadline(MYTHIC, novel, '2027-01-31')).toBe(obsidian.updateQuestField(MYTHIC, novel.line, 'deadline', '2027-01-31'));
    expect(setDeadline(MYTHIC, novel)).toBe(MYTHIC.replace(' [deadline::2026-12-31]', ''));
    expect(setDeadline(MYTHIC, novel)).toBe(obsidian.updateQuestField(MYTHIC, novel.line, 'deadline', ''));
    expect(changeQuest(MYTHIC, novel, { kind: 'deadline', date: '2027-01-31' }, DAY)).toBe(setDeadline(MYTHIC, novel, '2027-01-31'));
    expect(() => setDeadline(W40, mornings, 'Friday')).toThrow('a date');
  });
});
