# Epizen

A calm desktop app for a vault of Markdown notes, shaped like my Obsidian vault.
Tauri 2 (Rust) with React, TypeScript and Vite. macOS first.

## Goals

- Notes stay plain Markdown files that Obsidian can still open: frontmatter, `[[wikilinks]]`,
  `![[embeds]]`, callouts, tasks, `[key::value]` fields. No database, no sidecar files, no syntax of our own.
- Never lose a note, and never change one the user didn't ask to change. The app writes only what the
  user typed or asked to create: a new note never replaces a file, and a save replaces a note whole,
  atomically, and only while it still holds what the app read.
- Dark, calm, spacious. See DESIGN.md.

## Non-goals

- Sync, accounts, or the network for anything but the library's lookups: only when the user searches
  or saves, only to the fixed list of hosts in `src-tauri/src/net.rs` (MusicBrainz, the Cover Art Archive,
  iTunes, Open Library), and never with an account. Apple Calendar is reached through EventKit on this
  Mac, never a server: Calendar does its own syncing.
- Running Obsidian plugins (Dataview, Templater). Their code blocks show as code.
- Mobile, Windows and Linux builds, for now.

## Map

- `src-tauri/src/vault.rs`: the only code that touches the vault. Every path from the UI goes through
  `Vault::resolve`, or `Vault::new_path` for a new note (`create_note`) or a new cover (`create_file`).
- `src-tauri/src/net.rs`: the only code that goes on the network: the library's lookups, https to an
  allowlist of hosts, size-capped, MusicBrainz paced to one request a second. The e2e build answers from
  `test/fixtures/lookup/` instead.
- `src-tauri/src/settings.rs`: the app's own settings, a JSON file in its config folder (`EPIZEN_CONFIG_DIR`
  in tests), never in the vault.
- `src-tauri/src/lib.rs`: Tauri commands and startup (`--vault <folder>`, `EPIZEN_VAULT`, or the vault
  opened last time).
- `src-tauri/src/calendar.rs`: Apple Calendar behind one trait. `eventkit.rs` is the real one; the `e2e`
  build and the Rust tests use the in-memory one, so a test never reaches the user's calendars. A plan
  on the calendar view is an event there, linked to its task by `epizen://task?vault&note&id` in its
  URL (`src/lib/plans.ts`), never a line in the note.
- `src/`: the React UI. `src/lib/` holds parsing (frontmatter, wikilinks, callouts) and
  dates and periodic notes (moment.js formats, templates, what a day holds, week and month
  totals), tests beside it. `src/components/periodic/` draws daily, weekly and monthly notes as pages.
- `src/lib/tabs.ts`: the tabs (open, pin, close, each tab's history) and what the app's settings keep of
  them, checked when read back. `src-tauri/src/menu.rs` makes ⌘W close a tab rather than the window.
- `src/lib/library.ts`: the library's kinds (one place maps `Rating/music`, `kino`, `books`, `podcasts`,
  `youtube` to albums, films, books, podcasts, videos), reading their notes and writing new ones in the
  vault's format. `src/lib/lookup.ts`: the lookup sources' URLs and parsers. `src/components/library/`
  draws the library and a rated note's media page.
- `demo-vault/`: a fake vault in the real format, made by `scripts/make-demo-vault.mjs`.
  Tests only ever touch a copy. `npm run check` fails if a file in it changes.
- `e2e/`: WebdriverIO drives the real app through `@wdio/tauri-service`.

Try the app on a copy: `cp -R demo-vault /tmp/vault && EPIZEN_VAULT=/tmp/vault npm run tauri dev`

## Checks

`npm run check` runs everything in order and prints all of it (`npm run check:fast` the same
without step 6):

1. `cargo test`
2. `cargo clippy` on all targets and features, warnings as errors
3. `eslint`, type-aware, zero warnings
4. `tsc` for the app and for the e2e tests
5. `vitest`
6. e2e: builds a debug app with the `e2e` feature, launches it with no vault, a missing vault and a
   temp copy of `demo-vault/`, and saves a screenshot of every screen to `evidence/`

Then it checks `demo-vault/` is unchanged. CI runs `check:fast` on macOS for every pull request,
and `main` only takes pull requests that pass it (a branch needn't be up to date with `main` to
merge). The full run, e2e included, is the `full check` workflow, started by hand
(`gh workflow run full-check.yml --ref main`), or `npm run check` here.

E2E windows open on screen without focus. Don't click them during a run. The bottom 32px of each
screenshot sit below the page (the title bar's height) and aren't part of the UI.

## How Claude works here

Ship fast in the day, test everything in the evening. This Mac is shared and often loaded, and a
full run (e2e) takes minutes per change, so:

1. During the day, run `npm run check:fast` and the tests of what changed, show the output, and
   ship: open the pull request (template filled in: Testing, Risk, How to revert), merge it once
   CI's fast check is green, and reinstall the app.
2. Don't run the e2e suite for each change. Still write the e2e steps a change needs (a new
   screen gets one, with a screenshot), unrun until the evening.
3. The full run is for when Bat asks, usually in the evening: `npm run check` here, or the
   `full check` workflow on GitHub. Then fix what it finds, hold the day's new screenshots in
   `evidence/` against DESIGN.md, and ship the fixes the same way.

No review agents: no reviewer subagent, no Codex, no voting. I review the pull request and merge it
once CI is green.

When a review flags the same kind of problem twice, fix it at the source: a test, a lint rule,
or a line in this file.

## Conventions

- Code that writes to a vault needs a test that runs it on a copy of `demo-vault/` and proves
  that only the intended file changed, and that the rest of it is byte for byte the same.
- Tauri commands stay thin. Logic lives in `vault.rs` with unit tests.
- New Markdown syntax gets a Vitest case using real text from `demo-vault/`.
- npm versions are pinned exactly; the Rust toolchain is pinned in `rust-toolchain.toml`.
