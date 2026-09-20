# Writing an adapter

An adapter teaches `system-one` how to talk to one model over one HTTP request. It is a plain object implementing `ModelProtocol` from `system-one/adapter`. It does **no I/O** — the Promise client and the Effect layer own transport, cancellation, and timeouts, and both run the same core validation after your `decode`.

Every snippet below is compiled from [`docs/snippets.ts`](./snippets.ts) so it cannot drift from the API.

## The shape

```ts
import { defineAdapter, checkHttp, endpoint, bearer, record } from "system-one/adapter";
import type { ModelProtocol, PreparedRequest, ReceivedResponse } from "system-one/adapter";
import type { EvaluationRequest, DecodedEvaluation, Capabilities } from "system-one/core";
```

| Member                      | Purpose                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `id`                        | Stable adapter name; appears as `result.model.adapter`. Make routes visible (e.g. `laya-bridge-v1`). |
| `model`                     | What the caller asked for; appears as `result.model.requestedModel`.                                 |
| `capabilities`              | What you can _actually_ return. Checked before the request and against the response.                 |
| `encode(request)`           | Turn a validated `EvaluationRequest` into `{ url, method: "POST", headers, body }`.                  |
| `decode(response, request)` | Turn `{ status, headers, body }` into `DecodedEvaluation`. `body` is parsed JSON or `null`.          |

## 1. Declare capabilities honestly

```ts
const capabilities: Capabilities = {
  kinds: {
    boolean: { probabilities: true, confidence: false },
    choice: { probabilities: true, confidence: true },
    // omit `ordinal` entirely if the model cannot answer it
  },
  state: "text-or-structured", // "json" | "text-or-structured" | "text"
  descriptions: "json", // "json" | "text"
};
```

Rules:

- If you set `probabilities: true` for a kind, every answer of that kind **must** carry a full distribution or validation fails with `InvalidResponse`. Same for `confidence`.
- If you set `probabilities: false`, callers who pass `requirements: { probabilities: "required" }` get `UnsupportedCapability` before any network call. That is the intended outcome — never fake a distribution to satisfy them.
- Only add `context`/`maxQuestions` when you know the real limits. Unknown stays unknown.

## 2. Encode

```ts
function encode(request: EvaluationRequest): PreparedRequest {
  return {
    url,
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ model, state: request.state, questions: toWire(request) }),
  };
}
```

`request` is already validated, deep-copied, and frozen. Map the three public kinds (`boolean`, `choice`, `ordinal`) to your provider's names. Never truncate `state`, drop questions, or split one request into several — if the input is too big, let the provider reject it and classify that as `ContextLimitExceeded`.

Use `endpoint(url)` once at construction: it accepts HTTPS, or HTTP on loopback only, and rejects embedded credentials and fragments. Use `bearer(key)` to build the header — it rejects empty values and header injection.

## 3. Decode

```ts
function decode(response: ReceivedResponse, request: EvaluationRequest): DecodedEvaluation {
  classifyProviderErrors(response); // your documented codes first…
  checkHttp(response); // …then generic status → tag
  const body = record(response.body);
  return {
    answers: normalise(record(body.answers), request),
    ...(typeof body.model === "string" ? { resolvedModel: body.model } : {}),
  };
}
```

What to return per kind (the core validates all of it, so return what the provider gave you and nothing more):

| Kind      | Fields                                                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boolean` | `probabilityTrue?: number`, `predictedValue?: boolean` — at least one. **Do not derive one from the other.**                                                      |
| `choice`  | `value: K` (declared key), `probabilities?: Record<K, number>` (every key, sums to 1 ± 0.001)                                                                     |
| `ordinal` | `selectedIndex?: int`, `expectedIndex?: number`, `probabilities?: number[]` (one per level) — at least one. **Never round `expectedIndex` into `selectedIndex`.** |
| any       | `confidence?: { value: 0..1, definition: "yourprovider:what-it-means" }`                                                                                          |

Provider-reported `usage` maps to `{ inputTokens?, outputTokens?, totalTokens? }`. Omit what you do not have; never write `0` for unknown.

## 4. Classify errors

`checkHttp` maps status → tag (401/403 `AuthenticationError`, 402 `QuotaExceeded`, 429/529 `RateLimited` with `retryAfterMs`, 413 `ContextLimitExceeded`, 400/422 `InvalidRequest`, else `ProviderError`). Providers that return errors inside a 200 body must be classified **before** `checkHttp`:

```ts
if (body.success === false && codes.includes("2021")) {
  throw new System1Error("QuotaExceeded", "Provider requires credits", { providerCode: "2021" });
}
```

Throw `System1Error` only for documented operational failures. Any other exception is treated as a bug (Promise: rejects as-is; Effect: defect). Messages must be fixed strings — never interpolate headers, bodies, or state.

## 5. Keep secrets out of the object

Hold credentials in closure variables, not on the returned object. `defineAdapter` freezes the protocol; the conformance tests assert `JSON.stringify(adapter)` contains no secret.

## 6. Conformance expectations

Copy the pattern in [`packages/system1/src/adapters.test.ts`](../packages/system1/src/adapters.test.ts). An adapter is done when it demonstrates, offline with fixtures:

1. Correct wire encoding for every kind it advertises.
2. A successful decode through `createClient` with `requirements: { probabilities: "required" }` (if advertised).
3. Rejection (`InvalidResponse`) of: non-JSON body, `{}`, missing answers, unknown choice values, wrong-length ordinal distributions.
4. Correct tags for documented provider error codes and for 401/402/413/422/429/5xx.
5. `resolvedModel` and `usage` preserved when present, absent otherwise.
6. No secret in `JSON.stringify(adapter)` or in any error message.
7. Identical results through `system-one/effect`'s `layer(adapter)` with an injected `FetchHttpClient.Fetch`.

Add a dated record under `specs/` describing the provider contract you verified and what you could not verify (see `2026-09-19-cloudflare-route-status.md` for the format).
