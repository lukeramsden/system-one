# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Added

- `system-one/testing`: `stubModel({ answers | respond, capabilities?, resolvedModel?, usage? })` returning a `LocalModel` with recorded `calls`; `stubCapabilities` and `fullCapabilities` presets.
- `LocalModel` (`{ id, model, capabilities, evaluate(request) }`) accepted by `createClient({ model })` and `layer(model)` alongside `ModelProtocol`. `layer(localModel)` requires no `HttpClient`.

### Deprecated

- `testLayer` in `system-one/effect`; use `layer(stubModel(...))`.

## [0.1.1] - 2026-09-19

### Changed

- Consumer-focused README; maintainer material moved to `CONTRIBUTING.md`.
- Repository renamed to `lukeramsden/system-one`.
- Releases via `release-it` + tag-driven GitHub Actions publish with npm trusted publishing and provenance.

### Fixed

- `vite.config.ts` uses `deps.neverBundle` instead of deprecated `external`.

## [0.1.0] - 2026-09-19

Initial release, published as `system-one` (npm rejected `system1` as too similar to `systemjs`).

### Added

- Typed questions: `boolean`, `choice`, `ordinal`; literal keys preserved in result types; definitions deep-copied and frozen.
- Strict response validation shared by every adapter and runtime; `requirements: { probabilities: "required" }` tightens types and is checked before and after the request.
- Promise client (`system-one`): single attempt, `AbortSignal` + `timeoutMs`, redirects refused, sanitised `TransportError`.
- Effect service (`system-one/effect`): `System1` tag, `layer(model)` over any `HttpClient`, `testLayer`, lazy, interruptible, spans.
- Adapters: TypeSafe Jev (direct), Cloudflare AI Gateway (`typesafe/jev` via `/ai/run`), Laya via the `system1-laya-v1` bridge contract.
- Adapter SPI (`system-one/adapter`): `ModelProtocol`, `defineAdapter`, `checkHttp`, `endpoint`, `bearer`, `record`.
- Tagged `System1Error` with a closed `_tag` union; no secrets in messages or details.

[Unreleased]: https://github.com/lukeramsden/system-one/compare/v0.1.0...HEAD
[0.1.1]: https://github.com/lukeramsden/system-one/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/lukeramsden/system-one/releases/tag/v0.1.0

[Unreleased]: https://github.com/lukeramsden/system-one/compare/v0.1.1...master
