# Epizen: agent working agreement

Build small, useful features quickly. Keep responsibilities separate, verify changed behavior
as it is built, and use the requested evening run for broad regression and visual checks.
This is the shared instruction file for coding agents in this repository. `CLAUDE.md` points
here; keep workflow rules here so the two cannot drift.

## Scope and product invariants

- Work in this project only. Preserve unrelated edits and other sessions' work. Another
  project's files and work queue are read-only unless the user authorizes changes there.
- Epizen is a calm, macOS-first desktop app: Tauri 2, Rust, React, TypeScript and Vite.
  Read [DESIGN.md](DESIGN.md) for UI work and [REVIEW.md](REVIEW.md) for change risks.
  Mobile, Windows and Linux builds remain out of scope.
- Notes remain ordinary Obsidian-compatible Markdown: frontmatter, wikilinks, embeds,
  callouts, tasks and inline fields. No database, sidecars, proprietary syntax or execution
  of Obsidian plugins. Preserve text outside the requested edit, including formatting.
- Never lose a note or change one the user did not ask to change. New files must not replace
  existing ones. Saves are atomic and conditional on the content still matching what was
  read. A conflict preserves the user's unsaved text and offers recovery.
- No accounts or app-managed sync. Network access is limited to user-triggered library
  lookups through `src-tauri/src/net.rs`, which owns the host allowlist, redirect validation,
  HTTPS, response limits, timeouts and rate limits. Apple Calendar uses local EventKit.
- Tests use temporary copies of `demo-vault/`, isolated app settings and fake calendar/network
  providers. Never point a test at personal notes or calendars. Only remove temporary data
  created by that run; preserve the original fixture.

## Modules and foundations

A module owns a coherent set of features, its state, rules, UI and tests. A feature should
normally extend one module through a small public interface. Modules share foundations;
foundations must not depend on feature UI. Keep this a modular application in one repository;
separate services, packages, plugin registries and frameworks need a demonstrated benefit.

These are the current homes, not a request to move the whole codebase:

| Area | UI / entry | Logic / foundation |
| --- | --- | --- |
| Workspace, tabs, navigation | `src/components/workspace/` | `src/lib/tabs.ts`, `links.ts`, `linkIndex.ts`, `graph.ts` |
| Notes and editing | `src/components/Editor.tsx`, `src/components/NoteView.tsx` | `src/lib/edits.ts`, `saving.ts`, Markdown helpers |
| Periodic notes and quests | `src/components/periodic/` | `src/lib/periodic.ts`, `day.ts`, `quests.ts`, `thoughts.ts`, `rollup.ts` |
| Library and media | `src/components/library/` | `src/lib/library.ts`, `lookup.ts`, cover helpers |
| Calendar, plans, timer | `src/components/calendar/` | `src/lib/plans.ts`, `schedule.ts`, `timer.ts`, `timeblocks.ts` |
| Home | `src/components/home/` | `src/lib/home.ts`, `dashboard.ts` |
| Tray | `src/tray/`, `src/components/tray/` | `src/lib/tray.ts`, `src-tauri/src/tray.rs` |

Bare filenames in the last column are under `src/lib/`. Backend foundations:

- `src-tauri/src/vault.rs` is the only vault filesystem boundary. UI paths go through
  `Vault::resolve`, or `Vault::new_path` for creation. Reuse its guarded read/write operations.
- `src-tauri/src/settings.rs` owns app settings outside the vault; tests isolate them with
  `EPIZEN_CONFIG_DIR`.
- `src-tauri/src/net.rs` owns network I/O. Fixtures live in `test/fixtures/`.
- `src-tauri/src/calendar.rs` owns the calendar interface; `eventkit.rs` implements it on
  macOS. Tests and the `e2e` build use the in-memory implementation. Calendar plans link to
  tasks using `src/lib/plans.ts`; they do not write plan metadata into notes.
- `src/lib/api.ts` is the typed frontend bridge. `src-tauri/src/lib.rs` wires commands and
  startup; commands delegate to the responsible domain module. Only vault logic belongs in
  `vault.rs`, not every new backend feature.

### Dependency rules

1. Keep new domain rules in small, testable functions in `src/lib/` or the responsible Rust
   module. Keep components focused on rendering and interaction. Keep `src/App.tsx` focused
   on composing modules, navigation and shared lifecycle, extracting touched feature logic
   when useful.
2. Keep feature-specific hooks, styles, helpers and tests near their module. Use existing
   folders first. A genuinely new area can get `src/components/<area>/` and a clearly named
   domain file or folder in `src/lib/`; do not add empty architectural layers.
3. Cross-module calls use explicit typed functions, props or callbacks. Do not reach into a
   sibling's private hooks or mutate its state. Avoid circular imports. Extract a shared
   foundation only when there is an actual shared responsibility; no generic `utils` dump.
4. Pure domain code must not depend on React components, Tauri invocation or global UI state.
   Put I/O at the edge, using the existing bridge and providers. Validate external and persisted
   data at entry points; keep frontend/backend contracts aligned.
5. Give state one owner. Derive values instead of maintaining duplicate copies. Keep state
   local unless multiple features truly share it. Namespace module CSS to prevent style leaks.
6. A shared contract change includes its consumers and integration tests in the same change.
   Preserve compatibility where practical. Improve boundaries incrementally; do not bundle
   a repository-wide reorganization with a feature.

### Contain failures

- Use `src/components/ErrorBoundary.tsx` at meaningful screen or independent feature
  boundaries so navigation and unrelated areas remain usable. Keep unsaved text outside a
  subtree that may be discarded. Test recovery for new or changed failure boundaries.
- Catch rejected async operations and event-handler failures locally, with useful error and
  retry states. React boundaries cover rendering failures, not ordinary async/event failures.
  See [React's error boundary guidance](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary).
- Model loading, empty, unavailable and failed states. One unavailable lookup or denied
  calendar permission must not prevent reading or editing notes. Cancel or ignore stale
  results after switching notes/vaults, and clean up listeners, timers and subscriptions.
- Keep writes serialized where needed and preserve conflict checks. Do not blindly retry
  non-idempotent writes or hide failed saves behind an empty catch. Keep recovery text visible.
- For changes to shared services or failure handling, simulate the relevant failure and
  verify both the affected feature's recovery and an unaffected consumer. Folder separation
  alone does not prove isolation, and an error boundary cannot contain a native process crash.

## Fast feature loop

1. Inspect the current diff and the owning module. Identify the user-visible outcome, affected
   contracts and likely failure cases. For ordinary features this is a few sentences, not a
   planning document or approval checkpoint.
2. Implement the smallest complete vertical slice: domain behavior, UI, necessary I/O and
   meaningful tests. Follow existing patterns and design tokens. Keep unrelated cleanup out.
3. During iteration, run the changed tests and affected consumers. Add regression tests for
   bug fixes; cover success, important edge cases and relevant failures for behavior changes.
4. Once the code change is ready, run `npm run check:fast`. Run it again only after changes
   that could invalidate its result. Add a production build check when build/configuration,
   assets, dependencies or packaging changed. Do not run the full E2E suite per small edit.
5. Include needed E2E steps in the feature change, even when their execution waits until the
   evening. New screens need a journey and a screenshot. Report deferred checks explicitly.
6. Hand off or ship with a short account of the behavior, test results, remaining checks,
   risk and how to revert. Keep increments independently revertible and `main` usable.

Use judgment: no test that merely repeats implementation, no arbitrary coverage percentage,
no new dependency or abstraction without a concrete need. Documentation-only edits need
link/command/consistency checks, not a local native rebuild or app reinstall. Existing PR CI
still runs. Small visual-only edits can use visual verification without artificial unit tests.
Do not add reviewer subagents, voting rounds or repeated permission requests to routine work.
When the same defect recurs, add a focused regression test or lint rule at its source.

## Test commands and gates

Use the Node version in `.nvmrc` and Rust toolchain in `rust-toolchain.toml`. Use `npm ci` for
a fresh checkout or changed lockfile, not every edit. Keep npm versions exact and lockfiles
committed; Rust test/lint scripts use `--locked`.

During implementation, examples from the current layout:

```sh
npm test -- src/lib/library.test.ts src/components/library/AddMedia.test.tsx
npm run test:rust -- vault::tests
npm run typecheck
```

Choose files and Rust filters relevant to the change; confirm tests actually ran. A filter
that matched zero tests is not verification. For a shared helper, include its consumers.

The daytime and PR gate is:

```sh
npm run check:fast
```

`scripts/check.mjs --fast` verifies version consistency and runs Rust tests, Clippy on all targets/features with warnings as
errors, ESLint with zero warnings, app and E2E TypeScript checks, all Vitest tests and a check
that `demo-vault/` was not changed. It runs every step and fails if any step fails. It does
not launch E2E or produce a production bundle.

- Pure rules and parsing: colocated Vitest tests with representative Markdown; use demo-vault
  text for new syntax. Components/hooks: test observable behavior with Testing Library.
- Vault writes: tests on a temporary demo-vault copy must prove only intended files changed
  and all other files remained byte-identical. Cover no-op round trips, conflicts, existing
  destinations and path safety when those behaviors are touched. Keep Rust I/O tests too;
  a mocked frontend write cannot prove filesystem safety.
- Boundaries: test relevant contract, malformed input, rejection and recovery cases with
  deterministic fixtures/fakes. Control time for timers; avoid real network and user calendars.
- E2E: reserve for critical user journeys and integration with the real desktop app. Write
  stable behavior assertions; screenshots supplement assertions rather than replace them.
- High-risk changes to saving, paths, close/flush behavior, the bridge or native integration
  need relevant integration evidence before shipping. Run a necessary E2E check early if
  faster tests cannot establish safety; evening batching does not excuse unverified data loss.

## Evening / overnight validation

When the user says to test the day's features or run overnight checks, run the existing full
suite. This instruction file does not schedule a job, and no nightly schedule is configured.
Choose local execution for unpushed changes, or the remote workflow for the pushed revision:

```sh
# Local: includes the current working tree.
npm run check

# GitHub: tests the pushed main revision, not local uncommitted edits.
gh workflow run full-check.yml --ref main
```

Use the intended pushed branch in `--ref` if the work is not on `main`.
[GitHub documents dispatch and run monitoring here](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

1. Record the tested commit and any local changes. Review changes since the last verified
   full run and ensure every added feature has relevant coverage; add missing cases.
2. Run `npm run check`: the fast checks plus a debug Tauri build with the `e2e` feature and
   WebdriverIO journeys, followed by the fixture-integrity check. The configured journeys
   cover no vault, a missing vault, the demo-vault copy and the large graph fixture.
3. Keep one full run per checkout. E2E regenerates `evidence/`; preserve any evidence needed
   before another run. Windows open without taking focus; do not interact with them. The
   bottom 32px of captures are below the page because of the title bar.
4. Wait for completion and inspect every result. For GitHub, identify the run for the intended
   workflow/ref/commit, then use `gh run watch RUN_ID --exit-status`. A dispatched, queued or
   still-running job is not a pass. Keep the process/run identifier when handing work over.
5. Inspect the changed screens in `evidence/` against `DESIGN.md`, including clipping and
   error states. The remote workflow uploads `evidence` even after failure. Download and
   inspect it; a green job alone does not prove visual quality.
6. Reproduce failures, fix regressions in scope, add a regression test where useful, run
   focused checks, then rerun the full gate after fixes. Do not skip tests, weaken assertions
   or retry until green to disguise a flaky result. Record unrelated failures separately.
7. Leave a compact report with the tested revision, pass/fail results, fixes, screenshots
   and unresolved issues. Distinguish verified behavior, deferred work and environment blockers.

## CI and continuous delivery

- `.github/workflows/check.yml` runs `check:fast` on macOS for each pull request and supports
  manual dispatch. `.github/workflows/full-check.yml` is manual and includes E2E/screenshots.
  Preserve those lanes and caches; do not make every feature wait for full desktop testing.
- Treat the PR status named `check` as required for merge. Verify the latest revision is green;
  a local pass or an older commit's status is not enough. Never bypass a failed gate. When
  changing workflows, keep required status names and repository protection settings aligned.
- Fill in `.github/pull_request_template.md`: what changed, checks actually run, deferred
  E2E/visual checks, risk and revert steps. Fix any relevant pre-merge failure before merging.
- Continuous delivery here means keeping each integrated increment ready to build and ship.
  The check workflows validate changes. The release workflow publishes a production macOS archive
  for version tags; it does not install an app.
  For authorized feature delivery, open/update the PR, wait for CI, merge and reinstall when
  that is within the user's requested scope or standing authorization. Do not create extra
  approval steps for actions already authorized, or infer a release from a documentation task.
- When shipping an executable, build the intended revision with `npm run tauri -- build`
  using the normal production configuration, then smoke-check the built app on a vault copy.
  Never distribute the `e2e` feature or WebDriver plugins. `npm run build` only builds the web
  bundle and is useful for frontend build changes; it does not validate the native package.
- Keep rollback simple: revert the feature commit/PR and rebuild the prior version as needed.
  Avoid irreversible file-format changes. Rolling back code must never overwrite user notes.

## Completion standard

A feature is ready for daytime handoff when its behavior and failure paths are implemented,
module boundaries remain clear, the relevant tests and fast gate pass, and required E2E cases
are present with their execution status stated. A shipping PR also needs green CI for its
latest revision. Full regression validation is complete only after the full run and relevant
visual review pass. Report what was actually verified; never call deferred checks passed.

## Versioned delivery

Every delivered app version must use a new semantic version and have a matching GitHub Release
with clear, human-written notes and the production macOS app. Start this release line at `0.2.0`;
use patch increments for fixes and minor increments for feature releases while pre-1.0. CI and
local development rebuilds do not consume versions. Use `npm run version:bump` to keep npm, Cargo,
Tauri and both lockfiles aligned. Never overwrite an already published release asset. Follow
`RELEASING.md`, keep the required PR `check` gate, and wait for release publishing to finish.
The master logo is `assets/branding/epizen.png`; use it for app and repository branding.
