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

- Sync, accounts, or anything over the network.
- Running Obsidian plugins (Dataview, Templater). Their code blocks show as code.
- Mobile, Windows and Linux builds, for now.

## Map

- `src-tauri/src/vault.rs`: the only code that touches the vault. Every path from the UI goes through
  `Vault::resolve`, or `Vault::new_note_path` for a new note.
- `src-tauri/src/settings.rs`: the app's own settings, a JSON file in its config folder (`EPIZEN_CONFIG_DIR`
  in tests), never in the vault.
- `src-tauri/src/lib.rs`: Tauri commands and startup (`--vault <folder>`, `EPIZEN_VAULT`, or the vault
  opened last time).
- `src/`: the React UI. `src/lib/` holds parsing (frontmatter, wikilinks, callouts) and
  dates and periodic notes (moment.js formats, templates), tests beside it.
- `demo-vault/`: a fake vault in the real format, made by `scripts/make-demo-vault.mjs`.
  Tests only ever touch a copy. `npm run check` fails if a file in it changes.
- `e2e/`: WebdriverIO drives the real app through `@wdio/tauri-service`.

Try the app on a copy: `cp -R demo-vault /tmp/vault && EPIZEN_VAULT=/tmp/vault npm run tauri dev`

## Checks

`npm run check` runs everything in order and prints all of it:

1. `cargo test`
2. `cargo clippy` on all targets and features, warnings as errors
3. `eslint`, type-aware, zero warnings
4. `tsc` for the app and for the e2e tests
5. `vitest`
6. e2e: builds a debug app with the `e2e` feature, launches it with no vault, a missing vault and a
   temp copy of `demo-vault/`, and saves a screenshot of every screen to `evidence/`

Then it checks `demo-vault/` is unchanged. CI runs the same command on macOS for every pull
request, and `main` only takes pull requests that pass it.

E2E windows open on screen without focus. Don't click them during a run. The bottom 32px of each
screenshot sit below the page (the title bar's height) and aren't part of the UI.

## How Claude works here

Before saying a change is done:

1. Run `npm run check` and show its output, not a summary.
2. For UI changes, open the new screenshots in `evidence/` and hold them against DESIGN.md.
   A new screen gets an e2e step and a screenshot.
3. Open the pull request with the template filled in: Testing, Risk, How to revert.
4. Take it to merged with `/merge-gate <PR>`. The gate does the fresh-context review (one Claude
   reviewer and Codex), so there is no separate review before the pull request. Low and medium risk merge without me once CI is
   green; high risk waits for me with the evidence.

When a review flags the same kind of problem twice, fix it at the source: a test, a lint rule,
or a line in this file.

## Conventions

- Code that writes to a vault needs a test that runs it on a copy of `demo-vault/` and proves
  that only the intended file changed, and that the rest of it is byte for byte the same.
- Tauri commands stay thin. Logic lives in `vault.rs` with unit tests.
- New Markdown syntax gets a Vitest case using real text from `demo-vault/`.
- npm versions are pinned exactly; the Rust toolchain is pinned in `rust-toolchain.toml`.
