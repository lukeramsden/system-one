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

Record changes under `## [Unreleased]` in `CHANGELOG.md` as you go. To release, from a clean `master`:

```
pnpm release patch   # or minor / major
```

`release-it` runs `pnpm verify`, promotes `Unreleased` to a dated version section, bumps both `package.json` files, commits, tags `vX.Y.Z`, and pushes. Then `.github/workflows/publish.yml` takes over:

it checks the tag matches `package.json`, runs `pnpm verify`, publishes to npm with provenance (pre-release tags → `next` dist-tag), and creates a GitHub Release from the CHANGELOG section.

Auth: npm trusted publishing (repo `lukeramsden/system-one`, workflow `publish.yml`, environment `npm`), or repository secret `NPM_TOKEN` as fallback.

Commits: small, one concern each, conventional prefixes (`feat:`, `fix:`, `docs:`, `build:`, `ci:`, `chore:`).
