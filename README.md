# Epizen

A calm desktop app for a vault of plain Markdown notes, shaped like an Obsidian vault.
Tauri 2 with React and TypeScript, macOS first. For now it only reads.

Try it on a copy of the demo vault, never the original:

```sh
npm ci
cp -R demo-vault /tmp/vault && EPIZEN_VAULT=/tmp/vault npm run tauri dev
```

`npm run check` runs every check. [CLAUDE.md](CLAUDE.md) has the goals and the map,
[DESIGN.md](DESIGN.md) the look, and [REVIEW.md](REVIEW.md) what a review looks for.
