# 2026-09-19 — Public API and workspace boundaries

Status: accepted for 0.1.

## Context

Applications need typed decision questions, not another chat API. Models differ in response semantics and hosting protocols. Promise users must not pay for an Effect dependency; Effect users need interruption and HTTP dependency injection.

## Decision

Publish one ESM package, `system1`, with root Promise API, `core`, `adapter`, provider adapter subpaths, and an optional `effect` subpath. Use a pnpm workspace containing the library and a private, executable example workspace. VitePlus owns packing, tests, lint, and formatting; TypeScript also checks strict source and example types. Target Node 22.18+.

This replaces the draft's many public package names. A single release keeps shared protocol and runtime versions aligned. The monorepo remains useful for testing the consumer boundary and compiling documentation examples.

Questions and validated answers are shared. Protocol adapters encode and decode one HTTP exchange; runtimes own HTTP execution. The Effect service is supplied by a Layer over any protocol, rather than duplicating provider-specific Layer constructors. No nested Effect runtime execution is allowed.

The public kinds are boolean, choice, and ordinal. Their representations preserve missing data. Confidence retains a provider-defined identity. Ordinal expectation is not a selected level. Capability requirements are checked before transport and again against the response. Definitions and evaluation requests are immutable snapshots.

No automatic retries, truncation, fallback, splitting, or probability repair. A caller may explicitly compose retries, accounting for duplicate charges. Low confidence is a valid result, not an error.

## Required evidence

Type inference tests; both runtimes using shared fixtures; cancellation and interruption tests; packed consumer test without Effect installed; compile and runtime checks of examples; package export/declaration checks; adapter author documentation.

## Deferred

Streaming, local in-process model execution, batching, caching, routing policies, automatic LLM emulation, and continuous regression. Extend the protocol only when a real integration needs it.
