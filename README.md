<p align="center"><img src="assets/branding/epizen.png" width="160" alt="Epizen — aqua glass brain" /></p>

# Epizen

A calm, macOS-first second brain for ordinary Markdown notes. Open an Obsidian-compatible vault,
write and connect ideas, review your days, and keep the books, albums, films and podcasts you love.
Built with Tauri 2, Rust, React and TypeScript.

[Download the latest release](https://github.com/botsiti/epiZen/releases/latest) ·
[Changelog](CHANGELOG.md) · [Release process](RELEASING.md)

## What you can do

- **Write and connect notes.** Frontmatter, wikilinks, embeds, callouts, tasks, highlights and a live
  Markdown preview. Tabs, history, backlinks and graphs keep navigation close at hand.
- **Manage files safely.** Rename from the title with automatic incoming-link updates, duplicate,
  reveal in Finder, or move a note to recoverable trash from the sidebar. Saves check for external
  edits, and failed saves preserve your text.
- **Keep Home focused.** A compact overview of your day, life spheres, eight quests at a time and
  ten recent library entries, with dedicated views for the full collections.
- **Review quests and statistics.** Browse quests by month, track progress and XP, inspect daily
  focus by task and category, and see habit completion as proportionally filled monthly bars.
- **Build your library.** Albums, films, books, podcast episodes and videos, with covers, ratings,
  metadata, filters and a calendar view. Mixed shelves identify each kind with a small cover badge.
  Add notes, find covers, suggest existing genres, and keep favorite album tracks and thoughts.
- **Plan and focus.** Built-in daily, weekly and monthly pages, local Apple Calendar integration,
  and a focus timer with a menu-bar panel. Logged time stays in your daily notes.

## Your vault stays yours

Notes remain plain Obsidian-compatible Markdown. There is no app database, account, app-managed
sync or execution of Obsidian plugins. Settings live outside the vault. Network requests are
limited to library lookups you trigger; calendar access uses local EventKit.

## Install

Download the macOS Apple Silicon ZIP from [Releases](https://github.com/botsiti/epiZen/releases),
unzip it and move `Epizen.app` to Applications. The current releases are ad-hoc signed, not Apple
Developer ID notarized. Each release includes its compatibility and validation notes plus a SHA-256 checksum.

## Develop and verify

Use the Node version in `.nvmrc` and the Rust toolchain in `rust-toolchain.toml`.
Try it on a temporary copy of the demo vault:

```sh
npm ci
EPIZEN_DEMO=$(mktemp -d /tmp/epizen-demo.XXXXXX)
cp -R demo-vault "$EPIZEN_DEMO/vault"
EPIZEN_VAULT="$EPIZEN_DEMO/vault" npm run tauri dev
```

`npm run check:fast` runs the daytime checks; `npm run check` also runs desktop E2E.
[AGENTS.md](AGENTS.md) describes the working agreement, [DESIGN.md](DESIGN.md) the interface,
and [REVIEW.md](REVIEW.md) the review priorities. See [RELEASING.md](RELEASING.md) for versioning,
production builds and GitHub Releases.
