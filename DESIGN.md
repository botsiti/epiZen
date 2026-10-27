# Design

Dark and calm. One accent colour. A lot of space. The note is the subject; the app gets out of its way.

## Colour

Tokens live in `:root` in `src/styles.css`. Use them. A new colour gets added here first.

| Token          | Value     | For                                        |
| -------------- | --------- | ------------------------------------------ |
| `--bg`         | `#121416` | main pane                                  |
| `--bg-sidebar` | `#0e1012` | sidebar                                    |
| `--surface`    | `#171a1d` | callouts, code, quiet fills                |
| `--border`     | `#23272b` | hairlines only                             |
| `--text`       | `#e7e5e0` | body text, titles                          |
| `--text-muted` | `#9a9f9c` | secondary text, sidebar rows               |
| `--text-faint` | `#5f6568` | labels, hints, empty values                |
| `--accent`     | `#8fbcaa` | links, the selected note, focus, checkboxes |
| `--rest`       | `#86d8ac` | the timer's rest, so a break never reads as focus |

The accent is sage, and it is the only colour, with one exception: the graph colours its dots by
top-level folder, from `--graph-1` to `--graph-8`, the accent's own lightness and softness at
seven other hues.

The second exception is the daily, weekly and monthly pages (below): their charts colour each
task category, daily number and habit, in the jewel set the vault's Obsidian dashboards use
(`src/lib/categories.ts`), so time and moods can be told apart at a glance. Colour there is data,
never decoration. The homepage shares that look, and adds one set: each life sphere in its colour
from the Obsidian homepage (`SPHERES` in the same file), wherever a sphere is meant: its row, the
lead sphere, and the sport floor (Health/Fitness). The memento mori's bars mean no sphere, so they
stay sage.

The accent is sage everywhere else. No red for errors, no green for success, no
colour per callout type. A link to a missing note is muted with a dotted underline, not red.
Covers and other images bring their own colour; the interface doesn't.

## Space

Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96. Pick from it.

- The reading column is at most 680px wide, centred.
- The main pane has 96px above the content and 64px at the sides.
- 48px above a heading inside a note, 32px under the note title, 48px under the properties.
- When in doubt, add space rather than a line or a box.

## Type

- The system font (SF Pro on macOS), `ui-monospace` for code. No web fonts.
- Note body 16.5px with line height 1.7. Interface text 13.5–15px. Titles 30px, weight 600.
- Labels (folder above a title, callout titles, vault name): 12px, weight 600, uppercase,
  letter-spacing 0.08em, faint.

## Shape and motion

- Radius 6px. Borders are 1px hairlines. No shadows, gradients or blur.
- Motion only for a change of state (hover, a folder opening), 120ms ease-out. Nothing bounces
  and nothing moves on load. `prefers-reduced-motion` turns it off.
- The periodic pages and the homepage are the exception to both, on purpose: they are where the
  day is reviewed, and they should feel alive. See "Periodic pages".

## Components

- **Sidebar**: notes only, with image-only folders hidden. Folders first, numbers in natural
  order. A note indents one step past its folder's name. Long names end in "…". The selected
  note gets an accent bar and a soft accent background.
- **Properties**: a two-column list with faint labels. An empty value shows as a faint "—".
- **Callouts**: a surface block with a small uppercase title, no icon, no colour by type.
- **Tasks**: accent-tinted checkboxes. In a note's text they stay disabled; a daily note's page is
  where they are ticked, and that writes the one box back.
- **Periodic pages**: see the section below.
- **Calendar and timer**: see "Calendar and timer" below.
- **Home**: a periodic page in all but name (the frame, glass, hero and motion below), shaped like
  the Obsidian homepage, "Kaizen cockpit". The hero: the level's title and "Kaizen profile" as the
  kicker, `Level N` in the serif, one line, and a 2×2 block of Level (a thin bar to the next),
  Streak, Life XP and Today; the vault's name and counts faint at its foot. Then the memento mori
  (the year, the month and, with a birth date from Settings, life till 30, its weeks behind a click);
  a row of three cards: the last seven days' averages, their focus as bars (pointing at a day shows
  its categories), and today's tasks with Today, Week and Month; the life spheres, a segment per
  level, beside the lead sphere and the week's sport floor; and a glass shelf per folder of rated
  covers, the rating in accent, the maker faint below. Nothing on it writes to the vault, except
  that Today, Week and Month create a missing note from its template, as the calendar does.
- **Graph**: the whole main pane, no padding. Dots in their folder's colour, sized by how many links
  they have; links as faint hairlines that thin out as they grow in number. Pointing at a note (or
  finding it) lights it and its neighbours up, its links in accent, and dims the rest; their names
  show then, and for every note once zoomed in. A small legend top left, the search top right, a
  faint hint at the bottom.
- **Calendar**: a month above the notes in the sidebar, Monday first, with faint ISO week numbers.
  A small accent dot under a day or week that has its note; today in accent; the open note's day
  gets the soft accent background. Days of other months are faint.
- **Editor**: the note's source on the left and a live preview on the right, with space between them
  and no line. Headings and emphasis show in the source; Markdown's own marks are faint. A faint
  "Saving…" or "Saved" sits by the title.
- **Backlinks**: under the note, after a hairline: a label with the count, then each linking note's
  title in accent, its folder faint beside it, and the line that links, as plain text.
- **Link suggestions**: after `[[` in the editor, a surface list with a hairline; the matched letters
  in accent, the note's folder faint.
- **Forms**: a label above each field in the label style. Fields are surface fills with a hairline
  that turns accent on focus.
- **Empty and error screens**: a label, a title and one or two quiet lines. No illustrations.

## Periodic pages

A daily, weekly or monthly note opens as a page computed from the vault: no code in the note.
The note itself is a file, opened with Edit note; the page doesn't show its raw text. The look is Stravinsky's lit glass with the Obsidian dashboards'
content, and the moves are written here after react-bits (`src/components/periodic/`).

- **Width**: up to 1000px, wider than a note. Under 760px of pane the grids fold to one or two columns.
- **Glass**: cards are a faint top-lit gradient over the page, a 1px hairline, an inner top light
  and a soft drop shadow, radius 18px (24px for the hero). A soft light follows the pointer across
  a card and lights its nearest edge in sage.
- **Hero**: the period's name in the system serif (New York) at 58px with one slow shine as it
  opens, a kicker above it (weekday, ISO week, year) and the note's file name faint beside it. A
  slow aurora of sage, blue and rose drifts behind it under fine grain. The day's summary arrives
  word by word. A ring on the right shows the plan done. Below, chips to the day, week or month
  before and after and up a level; a chip whose note doesn't exist yet is dashed, and opening it
  creates the note from its template, as the calendar does.
- **Tabs**: plain words with a sage line that slides under the chosen one. The page remembers the
  last tab per kind of period for the session.
- **Numbers**: SF Pro Display, semibold, tabular. They count up as they appear (about 1.1s,
  easing out) and glide when they change.
- **Day**: tiles for XP, time logged (productive and recovery), tasks and habits; a check-in card
  where mood, energy, focus and social are set with a tap on a segment, and sleep and plan done are
  typed; a donut of time by category; the tasks, ticked with a small spark. Further tabs: task
  cards with a composer, habit pills with their streaks, the quests, and the stream (gratitude,
  important, the stream itself, and thought-record sessions). No timeline: the calendar draws time.
- **Thought records**: the Obsidian CBT wizard in five steps, opened from the hero's Thought record
  chip or the Stream tab. A dark sage glass dialog with the bird, serif italic titles, a progress
  line, the emotion wheel (six cores around a soft colour ring, the open one lifted with a white
  ring, its shades as chips below), thinking-trap cards with an Example that shows the thought and a
  reframe, and a finish card, How you felt → now. Escape or a click outside asks before discarding.
  Each session is a card on the Stream tab: its time, the situation in the serif, feelings before
  and after in their core emotion's colour, the traps, and the fairer thought.
- **Quests**: cards in a grid, each with its art (the vault's `Templates/quest-art`) under a dark
  veil, glass chips for the sphere, tier and time left, the scope and XP in mono caps, a round tick
  that fills with a counter's progress, and the title in the serif. Mythic quests sit on top,
  "pinned above every filter", in a slowly turning holo foil frame; All / Weekly / Monthly chips
  filter the rest. A quest past its time shows its penalty and a rose edge.
- **Week and month**: totals as tiles, each daily number's average with its line across the days,
  the days as cards (a week) or a heatmap lit by plan done (a month), Plus, Minus and Next from the
  weekly notes, and covers of what was listened to or watched. Further tabs: the days as rows with
  time stacked by category, the quests, the time blocks day by day (week), the habit grid, and charts
  (numbers over the days, plan done with its spread, time by category).
- **Motion**: cards rise into place in turn (560ms, staggered 45ms); arcs sweep, lines draw and
  bars grow in; ticks spark. Selection and presses use a spring that overshoots slightly. All of it
  stops under `prefers-reduced-motion`, and the e2e run turns it off (`data-motion="off"`) so
  screenshots show end states.
- **Writes**: only what is tapped or typed: on a day's page a tick, one property's value, a new task
  under the Tasks heading, or a thought-record row; on a quest, its box, done date, counter and the
  day's XP stamp, in the quest's own note. Each is made over the note as it is on disk, and written
  only while the note still holds that.

## Calendar and timer

The time blocks under the daily notes' tasks, on a week or a day, with Senioro's focus timer. It is
a periodic page in its look (the same glass, hero, chips, count-up numbers and spring), opened from
"Calendar" in the sidebar.

- **Top**: the week's dates (or the day's) in the serif display face, a kicker with the ISO week, the
  time logged counting up, ‹ › and Today, and a Week | Day switch. The timer's card sits beside it.
- **Grid**: hours down, 07–22, with the night before and after folded into a thin striped band that
  unfolds on a click and marks each block it hides. A hairline every hour, a slightly stronger one
  every three hours, small mono hour labels. Today's column is faintly lit, and a glowing sage line
  with a dot marks now.
- **Blocks**: soft rounded fills in their task's category colour with a solid rail down the left,
  side by side where they overlap; the title, and the time when tall enough. Past blocks recede (the
  colour steps down, the words only one notch). A block lifts under the pointer and shows its edges.
- **Day**: one wide column and, beside it, the day's tasks with their totals; pointing at one lights
  its blocks.
- **Timer**: a thin ring with a glowing dot that goes round once per pomodoro, or 60 ticks that fill
  with the stopwatch's seconds, and big light tabular numerals; in the task's colour while focusing,
  in `--rest` while resting. While it runs, a pill at the top of the sidebar carries the task and
  the time, its dot breathing.
- **Writes**: drawing a block (a drag, or a click for half an hour, on 15-minute marks), moving or
  resizing one, or deleting one (asked once) writes those lines of that day's note, checked against
  the text the calendar last read, as a day's page does. A day without a note gets one from its
  template, with the change in it, only when the change can be made. The timer writes each finished
  stretch under its task; while that note is open in the editor, the stretch waits for Done. A block
  that runs past midnight stays where it is (the editor changes it).

## Checking a UI change

The e2e run saves every screen to `evidence/`. Hold them against this page: one accent,
nothing cramped, nothing cut off without "…", chevrons that match their folder.
