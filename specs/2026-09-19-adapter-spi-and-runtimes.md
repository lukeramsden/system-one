# 2026-09-19 — Adapter SPI and the runtime split

Status: accepted for 0.1. Supersedes draft SPEC sections 5, 10, 11, 12, 13.

## Context

Two execution runtimes (Promise, Effect) must share every provider mapping, or providers drift between them. Provider knowledge (field names, envelopes, error codes) and execution concerns (HTTP, cancellation, dependency injection) change for different reasons.

## Decision

### `ModelProtocol` (public at `system1/adapter`)

```
id, model, capabilities
encode(request: EvaluationRequest): PreparedRequest       // url, method POST, headers, body string
decode(response: ReceivedResponse, request): DecodedEvaluation  // status, headers, parsed body (null if not JSON)
```

The protocol is pure, synchronous, and runtime-agnostic. It owns endpoint/envelope conventions, question encoding, provider error interpretation, and answer normalisation. It never performs I/O, retries, or timing. It may throw `System1Error` for documented operational failures; any other exception is a bug and stays a defect.

The SPI targets a single HTTP request/response. Streaming, polling, and in-process inference are deferred until a verified adapter needs them.

`decode` output is untrusted: core `validateResult` runs afterwards in both runtimes and recovers the question-specific type only after it passes. Adapters may not bypass it.

Helpers: `checkHttp` (status→tag, honours `retry-after`), `endpoint` (HTTPS only except loopback; rejects embedded credentials and fragments), `bearer` (rejects empty or header-injection values), `defineAdapter` (freezes, checks identifiers), `record` (shape guard).

### Runtimes

- `system1` (Promise): `createClient({ model, fetch? })`. One attempt, `redirect: "error"`, `AbortSignal` and `timeoutMs` combined with `AbortSignal.any`. Pre-aborted signals never reach `fetch`. Transport exceptions are replaced with a sanitised `TransportError`; the caller's abort reason is re-thrown as-is. No Effect import anywhere in this path.
- `system1/effect`: `System1` is a `Context.Tag`; `layer(model)` requires `HttpClient.HttpClient` so tests and platforms inject transport. Evaluation is lazy, interruption propagates to the HTTP request, operational failures are `System1Error` in the error channel, adapter bugs die as defects, and a span `system1.evaluate` carries adapter/model attributes. No `Effect.runPromise` inside the library. `testLayer` still runs `prepare` and `validateResult`, so fixtures cannot make invalid shapes look typed.

### Packaging

One published package, `system1`, ESM only, Node ≥22.18. Subpaths: `.`, `core`, `adapter`, `effect`, `adapters/typesafe`, `adapters/cloudflare`, `adapters/laya`. `effect` and `@effect/platform` are optional peers, externalised by `vp pack`. A smoke script proves the non-effect entry points load with Effect absent.

## Consequences

Adding a provider means one `ModelProtocol` plus fixtures; both runtimes get it for free. Adapters cannot express non-HTTP transports yet. Redirects are refused rather than followed, so misconfigured endpoints fail loudly instead of leaking credentials.
