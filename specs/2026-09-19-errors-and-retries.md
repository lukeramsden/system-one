# 2026-09-19 — Error model and the no-retry policy

Status: accepted for 0.1. Supersedes draft SPEC sections 14, 16, 17.

## Context

Exception handling is a major complexity source. Callers need to distinguish "fix your request", "fix your credentials or billing", "try later", and "the provider broke the contract" without parsing messages, and they must never receive secrets or customer state inside an error.

## Decision

### One error class, tagged

`System1Error extends Error` with `_tag` from a closed union and optional sanitised `details` (`status`, `providerCode`, `requestId`, `retryAfterMs`).

| Tag                     | Meaning                                                     | Retry?          |
| ----------------------- | ----------------------------------------------------------- | --------------- |
| `InvalidRequest`        | Invalid state/definitions/requirements, or provider 400/422 | no              |
| `UnsupportedCapability` | Adapter cannot meet the requested contract                  | no              |
| `AuthenticationError`   | 401/403, Cloudflare code 10000                              | no              |
| `QuotaExceeded`         | 402, Cloudflare code 2021 (no credits / no BYOK)            | no              |
| `RateLimited`           | 429/529; `retryAfterMs` when the header is valid            | caller's choice |
| `ContextLimitExceeded`  | 413                                                         | no              |
| `TransportError`        | fetch/HTTP failure or timeout; message is fixed text        | caller's choice |
| `InvalidResponse`       | Provider output fails the evaluation contract               | no              |
| `ProviderError`         | Other upstream failure                                      | caller's choice |

Promise: rejects with `System1Error`; a caller's abort reason is re-thrown unchanged. Effect: `System1Error` in the error channel; interruption stays interruption; non-`System1Error` throws from adapters become defects.

Messages are short fixed strings. Details never include headers, bodies, state, or tokens. Adapters are frozen so `JSON.stringify(adapter)` cannot leak credentials (closure-held only).

Low confidence or a wide distribution is a valid result, never an error.

### No hidden retries

The library makes exactly one attempt per `evaluate`. Reasons: retries multiply when stacked across SDK, client, and Effect schedules; repeating inference may be billed again, including after ambiguous network failures; only the caller knows its idempotency and cost tolerance. Callers compose retries explicitly (`Effect.retry` with a schedule keyed on `_tag`, or a loop around the Promise client) and should honour `retryAfterMs`.

Deadlines: `timeoutMs` in the Promise client; `Effect.timeout` in Effect. Both cancel the underlying request.

### Policies stay above the client

Fallback between models, confidence-gated escalation, and composite scoring are application or future optional-module concerns. They must record which model answered and why escalation happened, and must not reuse one confidence threshold across providers without validation.

## Consequences

Callers write a little retry code; in exchange behaviour is predictable and costs are visible. Error matching is on `_tag`, so messages can change without breaking callers.
