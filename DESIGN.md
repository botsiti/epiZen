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
- Never a `backdrop-filter` on anything as big as the window (a dialog's backdrop, an overlay):
  past 4096 device pixels, a full-screen window on a 5K display, WebKit draws it, and all inside
  it, black. Dim with a tint instead. `test/css-guards.test.ts` checks it.
- Motion only for a change of state (hover, a folder opening), 120ms ease-out. Nothing bounces
  and nothing moves on load. `prefers-reduced-motion` turns it off.
- The periodic pages, the homepage and the library are the exception to both, on purpose: they are
  where the day is reviewed and what was loved is kept, and they should feel alive. See "Periodic
  pages" and "Library and media pages". The menu bar's panel borrows their glass, small; see "Menu
  bar item and panel".

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
- **Menu bar item and panel**: see "Menu bar item and panel" below.
- **Library and media pages**: see "Library and media pages" below.
- **Home**: a periodic page in all but name (the frame, glass, hero and motion below), shaped like
  the Obsidian homepage, "Kaizen cockpit". The hero: the level's title and "Kaizen profile" as the
  kicker, `Level N` in the serif, one line, and a 2×2 block of Level (a thin bar to the next),
  Streak, Life XP and Today; the vault's name and counts faint at its foot. Then the memento mori
  (the year, the month and, with a birth date from Settings, life till 30, its weeks behind a click);
  a row of three cards: the last seven days' averages, their focus as bars (pointing at a day shows
  its categories), and today's tasks with Today, Week and Month; the life spheres, a segment per
  level, beside the lead sphere and the week's sport floor; and a glass shelf per folder of rated
  covers, the rating in accent on a small glass pill in the cover's corner, the maker faint below,
  and "See all" to the folder's tab in the library. Nothing on it writes to the vault, except
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
- **Tabs and the right sidebar**: see "Tabs and the right sidebar" below. Backlinks live there now,
  not under the note.
- **Link suggestions**: after `[[` in the editor, a surface list with a hairline; the matched letters
  in accent, the note's folder faint.
- **Forms**: a label above each field in the label style. Fields are surface fills with a hairline
  that turns accent on focus.
- **Date fields**: a faint calendar mark inside the field's right edge. A click or focus opens a small
  month calendar under the field (over it when there's no room), in the pages' glass: the field's
  label small and faint, the month in the serif with the year faint, ‹ › as round chips; weekday
  initials Monday first, today's in accent; six weeks of round days, the other months' faint, today
  a thin sage ring, the chosen day a lit sage disc. Under a hairline, Today and Yesterday as quiet
  chips and the chosen day in the serif's italic. The field keeps the focus, so YYYY-MM-DD can still be
  typed and the calendar follows it; ↓ goes into the days, the arrows move by day and week, Page Up
  and Down by month, Enter picks, Escape closes it and nothing behind it. After Notion's and
  Calendars' date sheets, Timepage and Booking.com, in Epizen's look (`src/components/DateField.tsx`).
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
  filter the rest. A quest past its time shows its penalty and a rose edge. On a week's and a month's
  Quests tab, "+ New quest" opens a glass composer above the cards: what counts as done in the serif,
  the life spheres as chips (the first pick filled, as the main sphere, each further one outlined with
  its bonus share, a − / + step for it and the XP it earns), the tiers as chips that set the XP
  (Common 150, Rare 500, Epic 1000, Legendary 2000), the XP, which lights the tier it falls in, and a
  target (0 for done or not).
- **Quest detail**: a quest's art or title opens it, a glass dialog over the window like the thought
  record's, edged in the quest's sphere colour: the art under its veil with the sphere and tier chips
  and the scope in mono caps, the title in the serif, when it started and when it is due (an edit for
  the deadline), what it has earned of its XP with a counter's bar and steps, its description in the
  serif's italic, and the adventure log: each chapter with its date on a thread of dots, rewritten in
  place, deleted on a second click ("Delete?"), XP stamps faint and left as they are; a field to add a
  chapter (⌘ + Enter). Mark complete or Reopen at its foot. Escape or a click outside closes it.
- **Week and month**: totals as tiles, each daily number's average with its line across the days,
  the days as cards (a week) or a heatmap lit by plan done (a month), and covers of what was listened
  to or watched. A week's Overview has Plus, Minus and Next as three cards written in place, in the
  serif, each with its Save, as on the Obsidian weekly dashboard. Further tabs: the days as rows with
  time stacked by category, the quests, the habit grid, and charts (numbers over the days, plan done
  with its spread, time by category). No timeline: the calendar draws time.
- **Motion**: cards rise into place in turn (560ms, staggered 45ms); arcs sweep, lines draw and
  bars grow in; ticks spark. Selection and presses use a spring that overshoots slightly. All of it
  stops under `prefers-reduced-motion`, and the e2e run turns it off (`data-motion="off"`) so
  screenshots show end states.
- **Writes**: only what is tapped or typed: on a day's page a tick, one property's value, a new task
  under the Tasks heading, or a thought-record row; on a week's page its Plus, Minus or Next section;
  a new quest's line under a week's or month's Quest XP heading; on a quest, its box, done date,
  counter and the day's XP stamp, its deadline, or a chapter added, rewritten or taken out, in the
  quest's own note. Each is written as the vault's Obsidian scripts write it, made over the note as it
  is on disk, and written only while the note still holds that.

## Calendar and timer

Apple Calendar, on a week or a day, as Calendar and Senioro show it, with Senioro's focus timer. It
is a periodic page in its look (the same glass, hero, chips, count-up numbers and spring), opened
from "Calendar" in the sidebar.

- **Top**: the week's dates (or the day's) in the serif display face, a kicker with the ISO week, the
  minutes the daily notes log counting up with their categories, how many events Calendar has on
  show, ‹ › and Today, and a Week | Day switch. The timer's card sits beside it. Until Epizen may use
  Calendar, a chip asks for it (or opens System Settings once it was refused).
- **Grid**: hours down, 07–22, with the night before and after folded into a thin striped band that
  unfolds on a click and marks each event it hides. All-day events sit in a row above the hours. A
  hairline every hour, a slightly stronger one every three hours, small mono hour labels. Today's
  column is faintly lit, and a glowing sage line with a dot marks now.
- **Events**: soft rounded fills in their calendar's colour with a solid rail down the left, side by
  side where they overlap: the title and time on one line, the notes under them (Senioro puts the
  task's words there). Past events recede (the colour steps down, the words only one notch). An
  event lifts under the pointer and shows its edges. Calendar colours are data here, like the
  categories on the periodic pages.
- **Not drawn**: the time blocks under the notes' tasks. They are the timer's record; the minutes
  are what counts, and the calendar is Calendar.
- **Day**: one wide column and, beside it, the day's tasks with their minutes; pointing at one
  lights its events.
- **Timer**: a thin ring with a glowing dot that goes round once per pomodoro, or 60 ticks that fill
  with the stopwatch's seconds, and big light tabular numerals; in the task's colour while focusing,
  in `--rest` while resting. While it runs, a pill at the top of the sidebar carries the task and
  the time, its dot breathing.
- **Writes**: drawing on empty time (a drag, or a click for half an hour, on 15-minute marks) plans
  a task: an event in Calendar written as Senioro writes one (the category as its title, the task's
  words as its notes, in the category's calendar), linked to the task. The note only gets the task
  (when new) and Senioro's focus-id on its line, never minutes. Moving, resizing or deleting (asked
  once) an event changes Calendar; one Calendar won't let change, or one running past the day, stays
  where it is. The timer writes each finished stretch under its task, with its minutes; while that
  note is open in the editor, the stretch waits for Done.

## Menu bar item and panel

The running focus in the macOS menu bar, as Senioro has it, in Epizen's look. There is one timer, the
main window's; the item and its panel only show it and send it commands.

- **Item**: a small monochrome ring with its dot at the top (the timer's dial, drawn as a template
  image, so macOS tints it). While a round runs, its time and the task's category in lowercase beside
  it in the menu bar's font with even-width digits: `00:37 code`, counting down in a pomodoro and up
  on the stopwatch, `focus` for a task without a category; `paused 00:37`; `rest 4:12`. Nothing
  running: the ring alone. It keeps time with the main window hidden, minimised or behind others.
- **Panel**: a click on the item opens it under the item, 360 × 600, and it goes when it loses focus,
  on Escape or on a second click. The window is borderless macOS dark glass with 14px corners, tinted
  down to the app's dark, a hairline round it. From the top: "Today" in the serif display face and the
  date muted beside it; a thin 00–24 line of the day, lit in sage up to a glowing dot at now, with
  marks every three hours, 00 06 12 18 24 faint below, and the time on a small sage pill above the dot.
  Then a glass card with the round under way: its kind as a kicker, big light tabular numerals with
  "left", "focused" or "paused", the task's breathing dot, category chip and words, and a thin line of
  how far the pomodoro is, in the task's colour (`--rest` while resting); or "Nothing running" in the
  serif's italic with Rest. Two numbers below: minutes focused today (the note's minutes and the
  stretch under way) and how much of the day is gone. Then today's tasks from today's note, as small
  glass cards: the category chip, the minutes logged, the words, and four pills to start a round:
  25 min (in sage), 42 min, Custom (a field for 1 to 240 minutes) and Live (the stopwatch). The task
  the round is on is edged in its colour and has its time with Pause or Resume and Stop instead; a
  ticked task is faint and takes no round. The foot, under a hairline: Open Epizen in the primary
  button, and Quit, which waits for the editor's last save as ⌘Q does.
- **Writes**: none of its own. A start from the panel is the calendar's right-click start, through the
  same timer, with the same task and the same writes to the note.

## Library and media pages

Albums, films, books, podcasts and videos: the rated notes in `Rating/music`, `kino`, `books`,
`podcasts` and `youtube`. They are periodic pages in their look (the frame, glass, aurora, serif
display face, count-up numbers, staggered rise and spring), opened from "Library" in the sidebar, a
shelf's "See all", or the note itself. Their structure is Bookmory's library and book page and
Letterboxd's film page; their palette is Epizen's. The covers bring the colour.

- **Library**: a hero with the kind's name in the serif ("Library" on All), a line about it, an Add
  for every kind on every tab (the tab's own kind in the primary button, "+ Add film", the others as
  quiet chips beside it: "+ Album", "+ Book", "+ Episode"), and on the right three numbers (in all,
  this year, the average in accent) over the spread of ratings, a bar per tenth of the scale
  (Letterboxd's histogram, in sage). Word tabs below: All, where the library opens, then Albums,
  Films, Books and Podcasts. Then the toolbar, and the latest as covers or all of it as a list.
- **Toolbar**: after the one on Obsidian's bases, in Epizen's look. On the left, Covers or List: its
  mark in accent, the word and a faint ⌃⌄, in a hairline pill, opening a menu of the two ("the
  latest 15", "all of them, as a table"); then the count, muted ("The latest 15 of 533", "533
  results") and, faint, the filters on ("Films · ambient"). On the right, quiet words with their
  line-drawn marks: Sort, Filter, Properties and Search on the list, Filter alone on the covers.
  Each opens a small menu under it in the pages' glass, radius 14px: a check in accent by what is
  chosen, hints faint at the right. Sort: Recent (latest first), Rating (best first), Title (A to
  Z), the maker (A to Z) and Year (newest first). Filter: on All the kinds, each with its mark and
  count, several at once and none on for all; the twelve most used genres with their counts, one at
  a time; "Clear the filters" in accent. Filter lit (its mark in accent, a count on a sage pill)
  while any is on. Properties: the list's columns, ticked to show, the title always. Search: the
  word opens a field in its place (title, maker or genre); Escape empties and closes it. The menus
  take the focus, ↑ ↓ move in them, Escape or a click outside closes them. Covers or List, and the
  columns, are the app's (its settings), not the vault's; the sort and the filters are kept per tab
  for the session, and the search until the covers are shown.
- **Covers**: the latest fifteen listened to, watched or finished of what the tab and the filters
  show, and under them "See all 533 in the list →" in accent. On All each card says its kind, faint,
  before the maker, and posters and square covers stand on one line with their titles level. The
  covers in a grid, each with its rating on a small glass pill in the corner (a faint dash when not
  rated yet), the title, and the maker and year faint. Covers lift under the pointer and load as they
  near the view. Last, a calendar of covers (Bookmory's book calendar), of everything the filters
  show: the month's name in the serif beside a strip of the year's twelve months, each a small bar of
  how many (the shown month in accent, with a glow), ‹ › to step, and the month's days as a grid,
  Monday first, each day showing the covers of what was listened to, watched or finished: up to
  three fanned like cards in a hand, the best rated in front and the others tilted behind, a little
  darker, spreading when pointed at; "+n" when there were more. It opens on this month, or the
  latest month that has something.
- **List**: everything the tab, the filters and the search show, as a table after a base's, on the
  page without a card: a header in the label style that stays at the top as the list scrolls, then a
  row per note, 64px, a hairline under each short of its rounded ends. The cover small (44px tall,
  posters narrower; without one, its first letter in the serif), the title in the serif, who made it
  ("By" on All, Artist, Director or Author on a kind's tab), the year faint, the kind with its mark
  (on All), the first genre as a hairline chip and "+n" faint for the rest, the rating as a thin sage
  bar out of 100 with the number in accent, and the day ("27 Sep 2026"; Listened, Watched or
  Finished on a kind's tab). An empty value is a faint "—". Title, By, Year, Rating and the day sort
  as Sort does, the chosen one in `--text` with a small accent arrow (down for the latest, the best
  and the newest, up for A to Z). A row lights softly under the pointer and in accent when focused;
  a click opens its page, ↑ ↓ Home End and Page Up and Down move between rows, Enter opens. In a
  narrower pane the genres go first, then the kind, the year and the rating's bar. A search that
  finds nothing says so in one line, with "Clear the search". The rows go on the page a few screens
  at a time, and only the first screen rises in, so six hundred open at once.
- **Without a cover**: when notes in view have no cover, a faint line under the toolbar says how
  many of all that are in view (not only the latest fifteen), "533 without a cover · Find covers",
  the last two words in accent. A cover is the note's first
  embedded image before any of its text (after the overview link); an image further down, after a
  heading, is a page of the note, not its cover.
- **Empty tab**: a glass card: a kicker, "Your first book" in the serif, one line on what Add does,
  and the Add button. Videos aren't added from Epizen; their empty card says so.
- **Media page**: a rated note in those folders opens as a page; Edit note opens its text in the
  editor. The hero is the cover large, a soft backdrop of the cover itself blurred far out and veiled
  down to the page, the title in the serif, the maker and year, the genres as glass pills, and the date
  listened, watched or finished (a book's start date too, and how many days it took). On the right the
  rating as a ring out of 100, after the timer's: a thin sage arc with a glowing dot at its end and a
  faint tick every ten; drag round it or use the arrow keys (Shift for tens), or type the number below
  it. An album's favourite tracks follow in a glass card, numbered in accent, in the serif's italic;
  then the note's own text in a glass card (the cover embed left out, since the hero shows it). Its
  backlinks are in the right sidebar. Under a blank cover, a "Find cover" chip; over a cover, when it
  is pointed at, "Change cover" on a dark chip at its foot.
- **Finding covers**: the sheet "Find covers" opens, in Add's dark glass, wider: the count of notes
  without a cover in the serif, a thin sage line of how many were searched, and one honest line of
  where it is ("Searched 120 of 533 · 98 found, 74 sure · about 7 min left. MusicBrainz takes one
  search a second."), then chips to show All, Sure, Unsure or Nothing found, each with its count.
  A row per note, filling in as its answer lands: a round sage tick, the note's title with its maker
  and year faint, the cover found, and what it is ("Dog Man Star · Suede · 1994") with, faint under
  it, "Sure" and what it fills in ("fills Year, genre"), or why it isn't sure ("from 1961", "no
  director to check", "or Dog Man Star · NERVE · 2026"). A sure one is ticked; an unsure one isn't.
  "1/3 ›" steps to the next match found, × skips the note (Undo brings it back). At the foot, Stop
  (or Go on) and "Save N covers" in the primary button. Searches go one note at a time per kind,
  the kinds side by side, at each service's pace: MusicBrainz one a second, iTunes about twenty a
  minute; a busy service is asked again after a pause. Closing with ticked covers unsaved asks first.
  A note is sure only when its title, its maker and its year agree with what was found (or, with
  no maker in the note, its title and year, and nothing else found as well); a title in another
  script ("Скромное обаяние буржуазии") is found by its label on Wikidata. Nothing that came out
  after the day the note was listened to, watched or finished can be it.
- **Finding one cover**: "Find cover" on a media page opens a smaller sheet with the best few covers
  found, each a cover card with its title, maker and year, and "Best match" in accent on a sure one,
  which is chosen; the chosen card is ringed in sage. A field above searches other words. The foot
  says where it saves and what it fills, with Cancel and Save cover.
- **Add**: a dark glass sheet over the window. A large search field that asks the kind's sources as
  typing pauses (a fifth of a second; MusicBrainz, which takes a request a second, waits a little
  longer): MusicBrainz and the Cover Art Archive for albums, Wikipedia for films, Wikipedia and Open
  Library together for books, iTunes for podcasts. Result rows with their cover, the title in
  semibold, the maker and year muted (or, from Wikipedia, its one line: "2023 film by Cord
  Jefferson"), the kind and genres faint; and a dashed "Enter it yourself". Each service's results
  show as soon as they land, the hint naming the one still being asked. Books list Wikipedia's first,
  then Open Library's, a book both have once, and each card says in a faint pill which one it is from.
  A Wikipedia result's director or author, year and genres come from Wikidata, read while it is
  pointed at, so picking it is quick; its poster or cover is saved. Picking one opens the form: the cover and
  a rating ring on the left; title, maker, year, genres (pills to remove, a field to add), rating and
  date on the right, the date set to today; the path it will be saved at, faint, and Save in the
  primary button. Nothing goes out until something is typed, and nothing is written until Save.
  The dates are date fields (above).
- **Adding a podcast episode**: the search finds shows; picking one lists its latest episodes (up to
  the 200 iTunes gives) under the show's own row, with a field that narrows them as it is typed, here,
  without asking again. Each episode is a row with the day it came out as a small leaf (the month in
  accent caps, the day in the serif, the year faint), its title, its date and length muted, and two
  faint lines of what it is about. Picking one fills the form: its title without its number (the
  vault's notes leave "#494 –" and "- #1073" out), the show as Author, the year it came out, the show's
  genre and the episode's artwork as the cover. "Enter it yourself" is there too, with the show filled
  in. Escape steps back: the form, the episodes, the shows.
- **Writes**: on a media page, setting the rating or a date (typed, or picked in the calendar) writes
  that one property, under the key the note already uses (`rating` or `Rating`), over the note as it is
  on disk. Add writes a new note in the vault's format for its kind and its cover as a new file in the
  kind's `_attachments`; neither ever replaces a file. A found cover is saved as a new file in the
  kind's `_attachments` and embedded as a new note's is, `![[name.jpg|240]]` on its own paragraph
  right after the overview link (or at the top of the body); the maker, year and genres it brings
  are written only where the note's property is empty or missing, under the note's own key, and no
  other line changes. The note is written only while it still holds what it held when its cover was
  looked for; one that changed meanwhile is left and says so. Changing a cover points its embed at a
  new image; the old file stays (`src/lib/coverEdits.ts`). A podcast note is one episode, named after it,
  with Author (the show), Rating, Year (only when known, where the vault's notes that have one put it),
  Genre and Listened.

## Tabs and the right sidebar

Obsidian's workspace in Epizen's own chrome: the sidebar's dark, hairlines, no glass.

- **Tab bar**: a 40px strip of `--bg-sidebar` across the top of the main pane, a hairline under it.
  Back and forward for the tab in front at its left, then the tabs (up to 184px each, the name ending
  in "…"), + for a new one, and at the right the right sidebar's switch, in accent while it is open.
  The tab in front takes the page's `--bg` and a hairline round its top, so it joins the page below;
  the others are faint words on the strip. Its × shows on the tab in front and under the pointer.
- **Pinned tabs** sit at the left with a small pin in accent where the × would be; a click on the pin
  unpins. A right-click on a tab opens a small surface menu with a hairline: Pin or Unpin, and Close.
- **Right sidebar**: as wide as the left one, `--bg-sidebar`, a hairline on its left. Its 40px head,
  level with the tab bar, names the note in front in the label style. Below, panels that fold like
  folders, with the same chevron, a label and a count: **Backlinks** (each linking note's title in
  accent, its folder faint beside it, and up to two lines of the line that links) and **Local graph**
  (the graph's look in a framed 248px panel: the note lit, its neighbours named, a faint hint under
  it). When the tab in front isn't a note, each panel says so in one faint line.
- Hover, a tab coming forward and a panel folding take 120ms; nothing else moves.

## Checking a UI change

The e2e run saves every screen to `evidence/`. Hold them against this page: one accent,
nothing cramped, nothing cut off without "…", chevrons that match their folder.
