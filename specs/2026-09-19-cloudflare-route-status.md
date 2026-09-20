# 2026-09-19 — Cloudflare AI Gateway route: verified routing, blocked inference

Status: accepted for 0.1. Supersedes draft SPEC sections 13.2 and 22.

## Context

Cloudflare lists `typesafe/jev` as a third-party model in its catalog and exposes it through the universal `POST /client/v4/accounts/{accountId}/ai/run` endpoint with a `{ model, input }` envelope. The `/ai/v1/chat/completions` path is unsuitable: Jev's request shape is not chat. Billing resolves in order: provider key on request → BYOK `default` alias → Unified Billing credits.

## What was verified (2026-09-19, account "Personal")

- `POST …/ai/run` with `{ "model": "typesafe/jev", "input": { state, questions } }` and a Workers-AI-scoped OAuth token **reached the gateway** and returned `{ success: false, errors: [{ code: 2021, message: "Insufficient balance; add money to your gateway or use BYOK" }] }`. Routing and model recognition therefore work.
- A token holding only `AI Gateway` permission returns `401` code `10000`; `/ai/*` requires Workers AI permission.
- The gateway list endpoint (`/ai-gateway/gateways`) was not accessible with the wrangler OAuth token (missing scope), so gateway ids could not be enumerated.

## What was NOT verified

- A **successful** inference response through Cloudflare. The account has no Unified Billing credits and no TypeSafe key stored as BYOK. The exact success envelope (`{ success: true, result: <native jev body> }` vs. bare native body) is therefore unconfirmed. The adapter accepts both: if the body has `success: true` and `result`, it decodes `result`; otherwise it decodes the body directly.
- Which response header carries a usable request id. The adapter reads `cf-aig-log-id`, then `cf-ray`.

## Decision

Ship `cloudflare({ accountId, apiToken, gatewayId?, model? })` in `system-one/adapters/cloudflare`:

- `accountId` must be 32 hex chars; `gatewayId` (optional, sent as `cf-aig-gateway-id`) must match `[A-Za-z0-9_-]+`.
- Only `typesafe/jev` is accepted for `model`; other catalog models have different semantics and need their own adapters.
- Provider codes are classified before generic HTTP status: `2021` → `QuotaExceeded`, `10000` → `AuthenticationError`; other `success: false` → `checkHttp` then `ProviderError`.
- Jev semantic decoding is shared with the direct adapter (`typed-decisions` codec), including the `typesafe:distribution-confidence` identity.

Live checks remain a **blocked** acceptance item until credits or a BYOK key exist. Tests use fixtures; none hit the network.

## Consequences

Users get an adapter whose routing is proven but whose success path is fixture-tested only. The README must state this plainly. Once a funded call succeeds, capture the real response as a fixture and remove the dual-envelope guess if one branch is dead.
