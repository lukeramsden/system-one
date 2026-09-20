# 2026-09-19 — Laya bridge contract (explicitly unverified hosted API)

Status: accepted for 0.1 as an opt-in contract. Supersedes draft SPEC section 13.3.

## Context

Laya (`convaiinnovations/laya`, Apache-2.0) is a non-autoregressive decision model whose Python package (`pip install laya`) exposes `agent.predict(state, questions)` and returns `noul`/`choice`/`score` answers with the same field names as TypeSafe (`choice`, `probabilities`, `score`, `legend`, `confidence`). We found **no published HTTP API**: the GitHub tree contains `agent.py`, `router.py`, `presets.py`, tests, and no server. Hugging Face inference endpoints are not assumed to speak this shape either.

## Decision

Ship `laya()` in `system1/adapters/laya` as an adapter for a **bridge you run yourself**, named `system1-laya-v1`:

- Request: `POST <endpoint>` with JSON `{ protocol: "system1-laya-v1", model, state, questions }`, where `questions` uses the TypeSafe-style wire encoding (`noul`/`choice`/`score`, `criteria`). Optional `Authorization: Bearer` if `apiKey` is configured.
- Response: the object returned by `laya`'s `predict()` — `{ answers: { <key>: {...} }, model?, usage? }`. Decoded by the shared typed-decisions codec; `confidence.definition` is `laya:reported-confidence` (Laya derives it differently from TypeSafe; the model card notes it ships over-confident until temperature-refit).
- Capabilities mirror the typed-decisions codec (probabilities for all kinds; confidence for choice/ordinal). Context/ token limits are not advertised because they vary by checkpoint (512/1024 tokens per question) and the bridge owns tokenisation.
- `endpoint()` guard applies: HTTPS, or HTTP on loopback only.

The adapter id is `laya-bridge-v1` so provenance makes the indirection visible.

## Consequences

Users must deploy a small server wrapping `laya.predict` that speaks this contract; the repo does not ship one (out of scope). If a hosted or official Laya HTTP API appears, add a separate adapter with a verified fixture rather than silently retargeting this one. The claim "Laya support" in docs must always say "via your bridge".
