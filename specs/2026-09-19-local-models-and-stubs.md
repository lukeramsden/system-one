# Local models and test stubs

Date: 2026-09-19

## Context

`ModelProtocol` describes one HTTP round trip. That forced test code to fake a URL and a `fetch` (Promise) or inject a `FetchHttpClient.Fetch` (Effect) just to return canned answers, and the Effect runtime grew a separate `testLayer` API that Promise users had no equivalent of. Stubbing should be one object that both runtimes accept.

## Decision

- Add `LocalModel = { id, model, capabilities, evaluate(request) => DecodedEvaluation | Promise }` to the adapter SPI. `Model = ModelProtocol | LocalModel`; discriminated by the presence of `evaluate`.
- `createClient({ model })` and `layer(model)` accept `Model`. For a `LocalModel` the runtime skips transport but still runs `prepare` (capability check, freezing) and `validateResult`. `layer` is overloaded so a `LocalModel` layer has no `HttpClient` requirement.
- New entry `system-one/testing` exports `stubModel(options)`: static `answers` or dynamic `respond(request)`, optional `capabilities`/`resolvedModel`/`usage`, records `calls`, `reset()`. Default capabilities advertise probabilities but not confidence, because an advertised field is mandatory in every answer.
- `testLayer` stays as a deprecated wrapper over `layer(localModel)`.

## Consequences

- Tests and examples need no fake fetch or HttpClient. The same stub is used by Promise and Effect code, so behaviour parity is exercised for free.
- Stubs cannot smuggle invalid shapes past the type system: validation is identical to the HTTP path.
- `LocalModel` also covers genuinely in-process models (e.g. a WASM classifier) without pretending they speak HTTP.
- Errors thrown by `evaluate` follow the adapter rule: `System1Error` → error channel/rejection; anything else → defect.
