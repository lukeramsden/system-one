# Contributing

## Layout

```
packages/system1   the published `system-one` package
examples/triage    same questions through Promise and Effect against a fixture adapter (`pnpm example`)
docs/              writing-an-adapter.md, semantics.md, snippets.ts (type-checked)
specs/             dated design decisions (YYYY-MM-DD-*.md); add one when changing a contract
scripts/smoke.mjs  packs the tarball and imports it from a fresh consumer, with and without Effect
```

## Verify

```
pnpm install
pnpm verify   # check + typecheck + test + build + example + smoke
```

Tests are offline. Live inference against TypeSafe (needs `TYPESAFE_API_KEY`) and Cloudflare (needs gateway credits or BYOK) has not been run in this repository and is tracked as blocked, not passed.

## Release

Tag-driven via `.github/workflows/publish.yml`:

1. Bump `packages/system1/package.json` version and add a `CHANGELOG.md` entry; commit to `master`.
2. `git tag vX.Y.Z && git push origin master vX.Y.Z`

The workflow checks the tag matches `package.json`, runs `pnpm verify`, publishes to npm with provenance (pre-release tags → `next` dist-tag), and creates a GitHub Release from the CHANGELOG section.

Auth: npm trusted publishing (repo `lukeramsden/system-one`, workflow `publish.yml`, environment `npm`), or repository secret `NPM_TOKEN` as fallback.

Commits: small, one concern each, conventional prefixes (`feat:`, `fix:`, `docs:`, `build:`, `ci:`, `chore:`).
