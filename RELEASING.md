# Releasing Epizen

Every delivered app version has a unique [Semantic Version](https://semver.org/), an immutable
`vMAJOR.MINOR.PATCH` tag and a GitHub Release with human-written notes and its production app.
Development and CI rebuilds do not consume versions. Never replace an already published binary.

While Epizen is in initial development, use a minor increment for a feature release (`0.2.0` →
`0.3.0`) and a patch increment for a compatible fix (`0.2.0` → `0.2.1`). State any breaking behavior
or migration explicitly. Once the product and its compatibility promises are stable, use `1.0.0`.

## Prepare a version

1. Run `npm run version:bump -- patch`, `minor`, or an explicit version such as `0.3.0`.
   This keeps npm, both lockfiles, Cargo and Tauri aligned. `npm run version:check` is part of the gate.
2. Write `releases/VERSION.md`: user-visible changes, compatibility, validation actually completed,
   and material known limitations. Update `CHANGELOG.md` and the README when needed.
3. Run the relevant tests, `npm run check:fast`, and the required desktop journeys. For a broad
   release, run `npm run check` and inspect its screenshots. Build the normal production app;
   never distribute the `e2e` feature or a WebDriver plugin.
4. Open a PR using the repository template. Wait for the latest revision's required `check` status,
   fix failures and merge. Tag the merged revision, not an unreviewed local working tree.

## Publish

```sh
git switch main
git pull --ff-only
VERSION=$(node -p "require('./package.json').version")
git tag -a "v$VERSION" -m "Epizen $VERSION"
git push origin "v$VERSION"
```

The `release` workflow verifies the tag/version and that the commit is on `main`, runs the fast
gate, builds the production Apple Silicon app, signs it ad hoc, and publishes its ZIP and
`SHA256SUMS` using the notes in `releases/VERSION.md`. Watch the workflow until it finishes and
verify the release assets. A queued workflow is not a published release.

The current package is **macOS Apple Silicon only**, ad-hoc signed and **not Apple Developer ID
notarized**. State this in release notes. Developer ID signing and notarization require their
own configured credentials; do not claim them for these builds.

For a local package after a production build, use `npm run release:package`. It verifies the
bundle's identifier, version and architecture and refuses to overwrite an existing archive.

## Branding and rollback

`assets/branding/epizen.png` is the supplied master logo. The macOS icon set, sidebar icon, README
and repository social preview all derive from it. Keep the functional menu-bar timer dial.

Keep the previous installed app when replacing it. Roll back to a previous GitHub Release or
revert the feature PR and build a new patch release. Never overwrite user notes during rollback.
