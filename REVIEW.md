# Review guide

For whoever reviews a pull request here: the `reviewer` subagent, an automated reviewer, or a person.

## What failure looks like

**A note was lost, or changed when the user didn't ask.** Everything else comes second.

Look hardest at:

- Anything that writes, renames, moves or deletes a file in a vault, or could: a new Tauri
  command, a new plugin or permission in `src-tauri/capabilities/`, a dependency with file access.
- Path handling: `..`, absolute paths, symlinks, hidden folders, case, Unicode normalization
  (macOS stores file names decomposed).
- Round trips: opening a note and saving it without edits must leave it byte for byte the same,
  including frontmatter order and quoting, CRLF, the trailing newline, and Cyrillic text.
- Clicks that could change a note by accident: task checkboxes, links to missing notes
  (Obsidian creates the note; Epizen must not unless asked), drag and drop.
- Obsidian compatibility: a file Epizen writes must still open in Obsidian and mean the same thing.
- The `e2e` feature or its WebDriver plugins reaching a release build.
- Tests that read or write `demo-vault/` itself instead of a copy.
- Any recursive delete, in tests and scripts too. It may only remove a temporary folder the
  same code just created, never a path that came from outside (an argument, an env variable).

## Severity

- **Important**: could lose or change a note, break Obsidian compatibility, ship test-only code,
  or make `npm run check` pass when it shouldn't. A crash or a security hole is Important too,
  even when no note is touched.
- **Nit**: anything else worth saying. **At most three per review.** Keep the three that matter
  most and drop the rest.
- **Pre-existing**: a real problem this pull request didn't introduce. Tag it so it doesn't read
  as the author's fault.

## Evidence

Every finding names a file and line, like `src-tauri/src/vault.rs:142`, and says what goes
wrong: this input gives that result. Read the code; don't guess from a function's name.
No file and line, no finding.

## Skip

- Lockfiles: `package-lock.json`, `src-tauri/Cargo.lock`
- Generated files: `src-tauri/gen/`, `src-tauri/icons/`, `dist/`, `evidence/`, `src-tauri/target/`
- The notes in `demo-vault/`, unless the pull request is about the fixture. Then check them
  against `test/demo-vault.test.ts`.

## Summary

Start with a count, like `2 important, 1 nit, 1 pre-existing.`, then one line per finding.
When there is nothing to fix, say so plainly: `Nothing to fix.`
