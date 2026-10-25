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

The accent is sage, and it is the only colour, with one exception: the graph colours its dots by
top-level folder, from `--graph-1` to `--graph-8`, the accent's own lightness and softness at
seven other hues.

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

## Components

- **Sidebar**: notes only, with image-only folders hidden. Folders first, numbers in natural
  order. A note indents one step past its folder's name. Long names end in "…". The selected
  note gets an accent bar and a soft accent background.
- **Properties**: a two-column list with faint labels. An empty value shows as a faint "—".
- **Callouts**: a surface block with a small uppercase title, no icon, no colour by type.
- **Tasks**: accent-tinted checkboxes. In a note's text they stay disabled; a periodic note's dashboard
  is where they are ticked, and that writes the one box back.
- **Dashboards**: above a daily, weekly or monthly note's text, computed by the app, never code in
  the note. Numeric properties as small meters (a large number, a 4px track with an accent fill), the
  tasks with their category and minutes faint beside them, and minutes by category as accent over a
  hairline-coloured planned bar. A week lists its seven days and a month its weeks, each opening its
  note; a missing one is faint.
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

## Checking a UI change

The e2e run saves every screen to `evidence/`. Hold them against this page: one accent,
nothing cramped, nothing cut off without "…", chevrons that match their folder.
