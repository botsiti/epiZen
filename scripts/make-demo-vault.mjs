#!/usr/bin/env node
// Writes the fake demo vault: daily, weekly and monthly notes, ratings for albums,
// films and YouTube videos, and SVG covers drawn here. Everything is invented.
//
// The output is committed as demo-vault/. This script refuses to write into a folder
// that already exists, so it can't overwrite edits made since.
//
//   node scripts/make-demo-vault.mjs [target-folder]

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'demo-vault');
if (existsSync(out)) {
  console.error(`${out} already exists. Move it away first; this script never overwrites a vault.`);
  process.exit(1);
}

// Seeded, so the vault comes out the same every time.
let seed = 20260801;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (list) => list[Math.floor(rand() * list.length)];

// A second sequence for what came later (time blocks, the social number), so adding it
// left every value drawn from the first one as it was.
let laterSeed = 20261027;
function later() {
  laterSeed = (laterSeed + 0x6d2b79f5) | 0;
  let t = Math.imul(laterSeed ^ (laterSeed >>> 15), 1 | laterSeed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const laterInt = (min, max) => min + Math.floor(later() * (max - min + 1));
// Mood, energy, focus and social are 1–5 in the vault, as its Obsidian check-in allows. They are
// drawn on the old 1–10 range and halved, so the draws (and everything after them) stay as they were.
const outOfFive = (n) => Math.min(5, Math.max(1, Math.round(n / 2)));

function write(path, text) {
  const full = join(out, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

// ---------------------------------------------------------------- dates

const DAY_MS = 86_400_000;
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const addDays = (date, n) => new Date(date.getTime() + n * DAY_MS);
const pad = (n) => String(n).padStart(2, '0');
const dmy = (d) => `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function ordinal(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

/** "Saturday, August 1st, 2026": Templater's "dddd, MMMM Do, YYYY". */
const longDate = (d) =>
  `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${ordinal(d.getUTCDate())}, ${d.getUTCFullYear()}`;

/** ISO week, named like the vault's weekly notes: "2026-W31 - 27.07.26". */
function weekName(d) {
  const monday = addDays(d, -((d.getUTCDay() + 6) % 7));
  const year = addDays(monday, 3).getUTCFullYear();
  const jan4 = utc(year, 1, 4);
  const firstMonday = addDays(jan4, -((jan4.getUTCDay() + 6) % 7));
  const week = 1 + Math.round((monday - firstMonday) / (7 * DAY_MS));
  return `${year}-W${pad(week)} - ${pad(monday.getUTCDate())}.${pad(monday.getUTCMonth() + 1)}.${String(monday.getUTCFullYear()).slice(2)}`;
}

/** Monthly notes are "MM.YY RPG". */
const monthName = (d) => `${pad(d.getUTCMonth() + 1)}.${String(d.getUTCFullYear()).slice(2)} RPG`;

const FIRST_DAY = utc(2026, 8, 1);
const DAYS = Array.from({ length: 60 }, (_, i) => addDays(FIRST_DAY, i));

// ---------------------------------------------------------------- covers

const PALETTES = [
  ['#1f2a33', '#8fbcaa', '#e9e3d5'],
  ['#2b1f2e', '#d08770', '#f2d5c4'],
  ['#14213d', '#fca311', '#e5e5e5'],
  ['#e9e3d5', '#3d5a80', '#ee6c4d'],
  ['#0b3d3a', '#7fb7a4', '#f1c27d'],
  ['#3a2e39', '#9e8fb2', '#f4e8c1'],
  ['#1b1b1e', '#e0b1cb', '#9f86c0'],
  ['#f2efe9', '#2a9d8f', '#264653'],
  ['#232931', '#4ecca3', '#eeeeee'],
  ['#3d405b', '#f2cc8f', '#e07a5f'],
];

const escapeXml = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function isLight(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

const slug = (text) =>
  text
    .toLowerCase()
    .replaceAll('&', 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A small abstract cover: one of five patterns in one of the palettes, with the title. */
function cover({ title, subtitle, index, width, height }) {
  const [bg, a, b] = PALETTES[index % PALETTES.length];
  const ink = isLight(bg) ? '#1b1b1e' : '#f4f1ea';
  const shapes = [];
  const cx = width * (0.35 + rand() * 0.3);
  const cy = height * (0.3 + rand() * 0.2);
  const unit = Math.min(width, height);

  switch (index % 5) {
    case 0: // rings
      for (let r = unit * 0.42; r > unit * 0.04; r -= unit * 0.06) {
        shapes.push(`<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="none" stroke="${shapes.length % 2 ? a : b}" stroke-width="${(unit * 0.018).toFixed(1)}" opacity="0.85"/>`);
      }
      break;
    case 1: // sunset bands
      for (let i = 0; i < 6; i++) {
        const y = height * 0.45 + i * height * 0.07;
        shapes.push(`<rect x="0" y="${y.toFixed(0)}" width="${width}" height="${(height * 0.07).toFixed(0)}" fill="${i % 2 ? a : b}" opacity="${(0.9 - i * 0.12).toFixed(2)}"/>`);
      }
      shapes.unshift(`<circle cx="${cx.toFixed(0)}" cy="${(height * 0.45).toFixed(0)}" r="${(unit * 0.22).toFixed(0)}" fill="${a}"/>`);
      break;
    case 2: // grid
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
          const size = width / 8;
          shapes.push(`<rect x="${(width / 8 + col * size).toFixed(0)}" y="${(height * 0.08 + row * size).toFixed(0)}" width="${(size * 0.8).toFixed(0)}" height="${(size * 0.8).toFixed(0)}" rx="${(size * 0.12).toFixed(0)}" fill="${(row + col) % 3 ? a : b}" opacity="${(0.15 + rand() * 0.8).toFixed(2)}"/>`);
        }
      }
      break;
    case 3: // waves
      for (let i = 0; i < 6; i++) {
        const y = height * (0.2 + i * 0.09);
        const amp = height * (0.03 + rand() * 0.04);
        const points = Array.from({ length: 13 }, (_, step) => {
          const x = (step * width) / 12;
          return `${x.toFixed(0)} ${(y + Math.sin(x / (width / 6) + i) * amp).toFixed(1)}`;
        });
        const d = `M ${points.join(' L ')}`;
        shapes.push(`<path d="${d}" fill="none" stroke="${i % 2 ? a : b}" stroke-width="${(unit * 0.02).toFixed(1)}" stroke-linecap="round"/>`);
      }
      break;
    default: // arcs
      shapes.push(`<circle cx="${(width * 0.62).toFixed(0)}" cy="${(height * 0.38).toFixed(0)}" r="${(unit * 0.3).toFixed(0)}" fill="${a}"/>`);
      shapes.push(`<path d="M 0 ${(height * 0.72).toFixed(0)} A ${(unit * 0.5).toFixed(0)} ${(unit * 0.5).toFixed(0)} 0 0 1 ${(width * 0.55).toFixed(0)} ${(height * 0.25).toFixed(0)}" fill="none" stroke="${b}" stroke-width="${(unit * 0.03).toFixed(1)}"/>`);
      break;
  }

  const size = Math.round(unit * 0.058);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  ${shapes.join('\n  ')}
  <text x="${(unit * 0.07).toFixed(0)}" y="${(height - unit * 0.12).toFixed(0)}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${size}" font-weight="600" fill="${ink}">${escapeXml(title)}</text>
  <text x="${(unit * 0.07).toFixed(0)}" y="${(height - unit * 0.12 + size * 1.4).toFixed(0)}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${Math.round(size * 0.7)}" fill="${ink}" opacity="0.7">${escapeXml(subtitle)}</text>
</svg>
`;
}

// ---------------------------------------------------------------- ratings

const ALBUMS = [
  ['Low Tide Hymns', 'Saltmarsh Choir', 2019, ['ambient', 'choral'], 84, ['Ebb', 'Lantern Psalm']],
  ['Paper Lanterns Over Tbilisi', 'Nino & the Quiet Hours', 2023, ['chamber pop'], 77, ['Rustaveli at Dawn']],
  ['Copper Wire Sermons', 'Ostrava Signal', 2016, ['post-rock'], 71, []],
  ['Glasshouse Weather', 'Mira Okonkwo', 2021, ['art pop'], 88, ['Condensation', 'Greenhouse Effect']],
  ['Night Shift at the Observatory', 'Tessellate', 2018, ['electronic'], 69, []],
  ['Field Recordings for Dogs', 'Hollow Pines', 2014, ['ambient', 'field recordings'], 74, ['Tall Grass']],
  ['The Slow Bicycle', 'Jun Arakawa Quartet', 2009, ['jazz'], 81, ['Uphill, Gently']],
  ['Brutalist Lullabies', 'Concrete Moth', 2022, ['ambient', 'drone'], 66, []],
  ['Summer in the Cold Room', 'Ellery Vance', 2017, ['folk'], 79, ['August Frost']],
  ['Seven Bells for Nobody', 'Kasimir Lind', 2012, ['modern classical'], 90, ['Bell IV', 'Bell VII']],
  ['Static Orchard', 'Dial Tone Garden', 2020, ['shoegaze'], 73, []],
  ['Midnight Tram to Nowhere', 'The Late Conductors', 2015, ['indie rock'], 62, ['Last Stop']],
  ['Salt & Graphite', 'Aurelia Moss', 2024, ['singer-songwriter'], 76, ['Pencil Marks']],
  ['Breathing Exercises', 'Unit Komorebi', 2019, ['ambient'], 85, ['Inhale (4)', 'Hold (7)']],
  ['Hymns for Empty Malls', 'Vapor Saint', 2016, ['vaporwave'], 58, []],
  ['Quiet Machinery', 'Lattice & Loom', 2021, ['IDM'], 80, ['Gearbox Lullaby']],
  ['The Weight of Small Rivers', 'Ines Taveira', 2013, ['fado', 'world'], 83, ['Ribeira']],
  ['Polyrhythm Picnic', 'Kofi Mensah Collective', 2022, ['afrobeat', 'jazz'], 87, ['Seven Over Four']],
  ['Tape Hiss Romance', 'Cassette Weather', 2011, ['lo-fi'], 70, []],
  ['Monastery Wi-Fi', 'Brother Algorithm', 2025, ['ambient', 'electronic'], 78, ['Vespers.exe']],
];

const FILMS = [
  ['The Lighthouse Accountant', 2019, ['drama', 'comedy'], 82],
  ['Nine Quiet Days', 2022, ['drama'], 74],
  ["The Orchard Keeper's Daughter", 2017, ['drama', 'mystery'], 79],
  ['Static Bloom', 2024, ['sci-fi'], 68],
];

const VIDEOS = [
  ['How I Plan a Week in Plain Text', 'Slow Systems', '18:42', 81],
  ['Building a Habit Tracker in 40 Lines', 'Tiny Code Club', '12:05', 76],
  ['Ambient Music Theory for Non-Musicians', 'Room Tone', '27:13', 88],
];

const REVIEWS = [
  'Best with headphones on a slow morning. The second half is where it opens up.',
  'Patient and warm. Nothing rushes, and nothing is wasted either.',
  'A little long, but the quiet tracks carry it.',
  'Put it on for focus and ended up just listening.',
  'Sounds like the weather outside today. In a good way.',
  'Fine in the background, better in full. Coming back to this one.',
];

const albumDay = (i) => DAYS[i * 3];
const filmDay = (i) => DAYS[9 + i * 14];
const videoDay = (i) => DAYS[14 + i * 16];

const listened = new Map();
const watched = new Map();
const note = (map, date, title) => map.set(ymd(date), [...(map.get(ymd(date)) ?? []), title]);

ALBUMS.forEach(([title, artist, year, genres, rating, tracks], i) => {
  const day = albumDay(i);
  note(listened, day, title);
  const file = `${slug(title)}.svg`;
  write(`Rating/music/_attachments/${file}`, cover({ title, subtitle: artist, index: i, width: 600, height: 600 }));
  // One rating is a quoted string, as some notes in a real vault are.
  const ratingValue = i === 12 ? `"${rating}"` : rating;
  write(
    `Rating/music/${title}.md`,
    `---
Artist: ${artist}
Year: ${year}
listened: ${ymd(day)}
genre:
${genres.map((genre) => `  - ${genre}`).join('\n')}
rating: ${ratingValue}
favorite tracks:${tracks.length ? `\n${tracks.map((track) => `  - ${track}`).join('\n')}` : ''}
---
[[00. Music 2026 MOC|music 2026]]

![[${file}|240]]

${pick(REVIEWS)} Listened on [[${dmy(day)}]].
`,
  );
});

write(
  'Rating/music/00. Music 2026 MOC.md',
  `# Music 2026

Albums I listened to this year, newest first.

| Album | Artist | Year | Rating |
| --- | --- | --- | --- |
${ALBUMS.map(([title, artist, year, , rating]) => `| [[${title}]] | ${artist} | ${year} | ${rating} |`)
  .reverse()
  .join('\n')}

Back to [[00. Home 2026|home]].
`,
);

FILMS.forEach(([title, year, genres, rating], i) => {
  const day = filmDay(i);
  note(watched, day, title);
  const file = `${slug(title)}.svg`;
  write(`Rating/kino/_attachments/${file}`, cover({ title, subtitle: String(year), index: i + 3, width: 400, height: 600 }));
  write(
    `Rating/kino/${title}.md`,
    `---
Year: ${year}
Watched: ${ymd(day)}
genre:
${genres.map((genre) => `  - ${genre}`).join('\n')}
rating: ${rating}
---
[[00. Kino 2026]]

![[${file}|200]]

Watched on [[${dmy(day)}]]. ${pick(['Quiet, funny, a bit sad.', 'Slow start, great last act.', 'Beautiful to look at.', 'Would watch again with friends.'])}
`,
  );
});

write(
  'Rating/kino/00. Kino 2026.md',
  `# Kino 2026

${FILMS.map(([title, year, , rating]) => `- [[${title}]] (${year}) — ${rating}`).join('\n')}

Back to [[00. Home 2026|home]].
`,
);

VIDEOS.forEach(([title, channel, duration, rating], i) => {
  const day = videoDay(i);
  note(watched, day, title);
  const file = `${slug(title)}.svg`;
  write(`Rating/youtube/_attachments/${file}`, cover({ title, subtitle: channel, index: i + 6, width: 640, height: 360 }));
  write(
    `Rating/youtube/${title}.md`,
    `---
Channel: ${channel}
url: https://www.youtube.com/watch?v=FAKE000000${i + 1}
Watched: ${ymd(day)}
duration: "${duration}"
rating: ${rating}
---
[[00. YouTube 2026]]

![[${file}|320]]

Watched on [[${dmy(day)}]]. ${pick(['Took notes.', 'One good idea, worth the time.', 'Saved for later too.'])}
`,
  );
});

write(
  'Rating/youtube/00. YouTube 2026.md',
  `# YouTube 2026

${VIDEOS.map(([title, channel, duration]) => `- [[${title}]] — ${channel}, ${duration}`).join('\n')}

Back to [[00. Home 2026|home]].
`,
);

// ---------------------------------------------------------------- daily notes

const TASKS = {
  code: [['fix the login bug', 30, 90], ['write tests for the sync queue', 45, 120], ['refactor the settings screen', 30, 90], ['review a pull request', 15, 45], ['ship the export button', 45, 150]],
  kaizen: [['plan tomorrow in five lines', 10, 20], ['clear the inbox', 15, 40], ['draft the weekly review', 20, 45]],
  sport: [['run 5 km', 28, 40], ['mobility and stretching', 15, 30], ['gym: upper body', 50, 75]],
  book: [['read 30 pages', 30, 60], ['notes on chapter four', 20, 40]],
  study: [['linear algebra: eigenvectors', 40, 90], ['statistics: confidence intervals', 40, 80], ['English: twenty new words', 15, 30]],
  business: [['call with the accountant', 20, 45], ['update the pitch deck', 45, 120]],
  dog: [['long walk with the dog', 40, 70]],
};
const HABITS = ['no sweet', 'no news', 'consciousness', 'sleep schedule', '7 useful hours', 'exercise', 'meditation'];
const SUMMARIES = ['Quiet, steady day.', 'Started slow, finished strong.', 'Too many small things, not enough deep work.', 'Good focus before lunch, foggy after.', 'Rested. Did what mattered.', 'Busy but calm.'];
const GRATITUDE = ['coffee on the balcony', 'a long call with a friend', 'the dog being ridiculous', 'rain at night', 'a bug that turned out to be one line', 'a good book'];
const THOUGHTS = ['Ideas come on walks, not at the desk.', 'Write the plan before opening the laptop.', 'Less news, more sleep.', 'Small steps still count.', 'The hard part was starting.'];

const dailyStats = new Map();

DAYS.forEach((day, i) => {
  const tags = Object.keys(TASKS);
  const tasks = Array.from({ length: int(3, 6) }, () => {
    const tag = pick(tags);
    const [text, min, max] = pick(TASKS[tag]);
    return { tag, text, minutes: int(min, max), done: rand() < 0.72 };
  });
  const doneCount = tasks.filter((task) => task.done).length;
  const stats = {
    done: Math.round((doneCount / tasks.length) * 100),
    sleep: Number((5.5 + rand() * 3).toFixed(1)),
    focus: outOfFive(int(3, 9)),
    energy: outOfFive(int(3, 9)),
    mood: outOfFive(int(4, 9)),
    tasks,
  };
  dailyStats.set(dmy(day), stats);

  // The time each task took, as the vault's timer logs it under the task: "    - 10:56–11:09".
  // One stretch, or two with a break between when it ran long; they add up to its minutes.
  let clock = 8 * 60 + laterInt(0, 90);
  const clockText = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const blocks = tasks.map((task) => {
    const parts = task.minutes > 50 && later() < 0.5 ? [Math.round(task.minutes / 2), task.minutes - Math.round(task.minutes / 2)] : [task.minutes];
    return parts.map((length, n) => {
      clock += n ? laterInt(15, 40) : laterInt(10, 50);
      const block = `    - ${clockText(clock)}–${clockText(clock + length)}`;
      clock += length;
      return block;
    });
  });
  const social = outOfFive(laterInt(3, 9));

  const prev = addDays(day, -1);
  const next = addDays(day, 1);
  const media = [
    ...(listened.get(ymd(day)) ?? []).map((title) => `**Listened:** [[${title}]]`),
    ...(watched.get(ymd(day)) ?? []).map((title) => `**Watched:** [[${title}]]`),
  ];

  write(
    `Calendar/2026/days 2026/${dmy(day)}.md`,
    `---
date: ${ymd(day)}T${pad(int(20, 23))}:${pad(int(0, 59))}
tags:
  - Daily
cssclasses:
  - daily
  - rpg-day
  - ${WEEKDAYS[day.getUTCDay()].toLowerCase()}
done: ${stats.done}
sleep: ${stats.sleep}
focus: ${stats.focus}
energy: ${stats.energy}
mood: ${stats.mood}
soc: ${social}
---

> [!tldr]+ **Summary of the day:**
> ${pick(SUMMARIES)}

> [!navigation]+ Navigation
> **Date Navigation**
> [[${dmy(prev)}|← Yesterday]] | [[${dmy(next)}|Tomorrow →]] | [[${weekName(day)}|Week]] | **[[${monthName(day)}|${monthName(day).slice(0, 5)}]]**

>[!habits]- Habits
${HABITS.map((habit) => `> - [${rand() < 0.6 ? 'x' : ' '}] ${habit}`).join('\n')}

## ${longDate(day)}

### Tasks
${tasks.map((task, n) => [`- [${task.done ? 'x' : ' '}] #daily/${task.tag} — ${task.text} [minutes::${task.minutes}]`, ...blocks[n]].join('\n')).join('\n')}

${media.length ? `${media.join('\n')}\n\n` : ''}**Gratitude practice:** ${pick(GRATITUDE)}

### stream of consc
${pick(THOUGHTS)}${i % 7 === 3 ? ' Day ' + (i + 1) + ' of the experiment.' : ''}
`,
  );
});

// ---------------------------------------------------------------- weekly and monthly notes

const average = (values) => (values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(1);
const hours = (minutes) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

const weeks = new Map();
for (const day of DAYS) weeks.set(weekName(day), [...(weeks.get(weekName(day)) ?? []), day]);

const weekNames = [...weeks.keys()];
const firstMonday = addDays(FIRST_DAY, -((FIRST_DAY.getUTCDay() + 6) % 7));
const weekBefore = weekName(addDays(firstMonday, -7));
const weekAfter = weekName(addDays(firstMonday, 7 * weekNames.length));
const PLUS = ['Kept the morning routine', 'Shipped on Friday', 'Slept before midnight most days', 'Long runs felt easy'];
const MINUS = ['Too much phone in the evenings', 'Skipped two workouts', 'Meetings ate Wednesday', 'Late nights mid-week'];
const NEXT = ['Protect two deep-work blocks', 'One day without news', 'Finish the book', 'Plan the month review'];

weekNames.forEach((name, i) => {
  const days = weeks.get(name);
  const stats = days.map((day) => dailyStats.get(dmy(day)));
  const months = [...new Set(days.map(monthName))];
  write(
    `Calendar/2026/weeks/${name}.md`,
    `---
cssclasses:
  - rpg-week
---

##### Week Plans
<< [[${weekNames[i - 1] ?? weekBefore}]] | [[${weekNames[i + 1] ?? weekAfter}]] >>

### Days
${days.map((day) => `- [[${dmy(day)}]] · ${WEEKDAYS[day.getUTCDay()]}`).join('\n')}

Month: ${months.map((month) => `[[${month}]]`).join(', ')}

#### Plus
- ${pick(PLUS)}

#### Minus
- ${pick(MINUS)}

#### Next
- ${pick(NEXT)}

#### Statistics
Average mood ${average(stats.map((s) => s.mood))}, focus ${average(stats.map((s) => s.focus))}, plan done ${average(stats.map((s) => s.done))}% over ${days.length} days.
`,
  );
});

const months = new Map();
for (const day of DAYS) months.set(monthName(day), [...(months.get(monthName(day)) ?? []), day]);

for (const [name, days] of months) {
  const stats = days.map((day) => dailyStats.get(dmy(day)));
  const totals = new Map();
  for (const task of stats.flatMap((s) => s.tasks)) totals.set(task.tag, (totals.get(task.tag) ?? 0) + task.minutes);
  const monthNumber = days[0].getUTCMonth() + 1;
  const albums = ALBUMS.filter((_, i) => albumDay(i).getUTCMonth() + 1 === monthNumber);
  const films = FILMS.filter((_, i) => filmDay(i).getUTCMonth() + 1 === monthNumber);
  write(
    `Calendar/2026/months 2026/${name}.md`,
    `---
cssclasses:
  - rpg-month
---

### Hours
| Category | Time |
| --- | --- |
${[...totals].sort((a, b) => b[1] - a[1]).map(([tag, minutes]) => `| ${tag} | ${hours(minutes)} |`).join('\n')}

### Mood
Average mood ${average(stats.map((s) => s.mood))}, energy ${average(stats.map((s) => s.energy))}, focus ${average(stats.map((s) => s.focus))}, sleep ${average(stats.map((s) => s.sleep))}h across ${days.length} days.

### Weeks
${[...new Set(days.map(weekName))].map((week) => `- [[${week}]]`).join('\n')}

### Listened
${albums.map(([title, artist, , , rating]) => `- [[${title}]] — ${artist} (${rating})`).join('\n')}

### Watched
${films.map(([title]) => `- [[${title}]]`).join('\n') || '- nothing this month'}

### Plans for month
- ${pick(NEXT)}

## Month Summary
\`\`\`dataview
table done, sleep, focus, energy, mood
from "Calendar/2026/days 2026"
where date.month = ${monthNumber}
sort file.name asc
\`\`\`
`,
  );
}

write(
  '00. Home 2026.md',
  `# 2026

## Calendar
${[...months.keys()].map((month) => `- [[${month}|${MONTHS[Number(month.slice(0, 2)) - 1]}]]`).join('\n')}

## Rating
- [[00. Music 2026 MOC|Music]]
- [[00. Kino 2026|Kino]]
- [[00. YouTube 2026|YouTube]]
`,
);

// ---------------------------------------------------------------- templates

// Obsidian template syntax, as Epizen fills it when it creates a periodic note:
// {{title}}, {{date:FORMAT}}, {{date+1d:FORMAT}} and, in a week, {{monday:FORMAT}} and the other days.
write(
  'Templates/Daily.md',
  `---
date: {{date:YYYY-MM-DDTHH:mm}}
tags:
  - Daily
cssclasses:
  - daily
  - rpg-day
done:
sleep:
focus:
energy:
mood:
---

> [!tldr]+ **Summary of the day:**
> 

> [!navigation]+ Navigation
> **Date Navigation**
> [[{{date-1d:DD.MM.YYYY}}|← Yesterday]] | [[{{date+1d:DD.MM.YYYY}}|Tomorrow →]] | [[{{monday:GGGG-[W]WW - DD.MM.YY}}|Week]] | **[[{{date:MM.YY [RPG]}}|{{date:MM.YY}}]]**

## {{date:dddd, MMMM Do, YYYY}}

### Tasks
- [ ] 

**Gratitude practice:** 

### stream of consc
`,
);

write(
  'Templates/Weekly.md',
  `---
cssclasses:
  - rpg-week
---

##### Week Plans
<< [[{{date-7d:GGGG-[W]WW - DD.MM.YY}}]] | [[{{date+7d:GGGG-[W]WW - DD.MM.YY}}]] >>

### Days
${['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  .map((day) => `- [[{{${day}:DD.MM.YYYY}}]] · ${day[0].toUpperCase()}${day.slice(1)}`)
  .join('\n')}

Month: [[{{date:MM.YY [RPG]}}]]

#### Plus

#### Minus

#### Next
`,
);

write(
  'Templates/Monthly.md',
  `---
cssclasses:
  - rpg-month
---

### Plans for month

## Month Summary
`,
);

console.log(`Wrote the demo vault to ${out}`);
