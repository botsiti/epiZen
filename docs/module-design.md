# Module design

Epizen applies the [Codebase Design principles](https://github.com/mattpocock/skills/tree/main/skills/engineering/codebase-design)
at its existing feature seams. A module owns behavior and its tests; its callers should not need
to know its internal sequencing or dependencies. This is one application, not a plugin framework.

## Assistant

The workspace talks to `AssistantWorkspace`; original artwork is exposed separately by `Spike`.
The controller owns conversation state, pending actions and save ordering outside the rendering
recovery subtree. Pure rules in `src/lib/assistant` prepare changes without performing I/O.
The typed bridge and native assistant module validate requests before delegating them.

There are two real model adapters: fixed-endpoint OpenAI API requests and a bounded Codex CLI
process using its managed ChatGPT login. Both return the same conversation/action contract.
Neither gets a shortcut around reviewed writes or vault path checks. The process module owns
bounded I/O, cancellation and child cleanup for Codex and local speech synthesis. Speech owns
permission handling, on-device recognition and temporary audio cleanup.

## Plugin preferences and lifecycle

The existing plugin catalog owns identifiers and dependencies. `effectivePlugins` determines
what can run; a disabled parent pauses dependents while preserving their configured choices.
Per-vault display settings are validated in `pluginDisplay.ts`. Settings owns one editable draft;
the runtime context exposes saved values, not another mutable store. Feature screens consume
their own view and section choices. Presentation changes never rewrite notes.

Module failure recovery belongs around optional screens, with ordinary note editing and workspace
navigation outside. Timers, native calendar listeners and expensive indexes keep their existing
enable/disable lifecycle guards. Disabling an active timer still requires settling its pending saves.

## Enforced seams and verification

`test/module-seams.test.ts` prevents feature UI/native invocation in domain rules, rejects external
imports into private assistant implementation, and detects runtime cycles among domain modules.
Behavior tests cover independent vault preferences, disabled dependencies, failed-save drafts,
provider failure, process cancellation and a failed optional screen beside an unaffected note draft.
Native journeys prove changes against disposable vault copies and keep all unrelated files identical.

`App.tsx` continues to compose existing modules and shared navigation. Further extraction should
move coherent behavior behind a smaller interface, not move its parameter list into another file.
