# Changelog

## 0.1.0 — 2026-09-19

Initial release.

- Typed questions: `boolean`, `choice`, `ordinal`; literal keys preserved in result types; definitions deep-copied and frozen.
- Strict response validation shared by every adapter and runtime; `requirements: { probabilities: "required" }` tightens types and is checked before and after the request.
- Promise client (`system1`): single attempt, `AbortSignal` + `timeoutMs`, redirects refused, sanitised `TransportError`.
- Effect service (`system1/effect`): `System1` tag, `layer(model)` over any `HttpClient`, `testLayer`, lazy, interruptible, spans.
- Adapters: TypeSafe Jev (direct), Cloudflare AI Gateway (`typesafe/jev` via `/ai/run`), Laya via the `system1-laya-v1` bridge contract.
- Adapter SPI (`system1/adapter`): `ModelProtocol`, `defineAdapter`, `checkHttp`, `endpoint`, `bearer`, `record`.
- Tagged `System1Error` with a closed `_tag` union; no secrets in messages or details.
