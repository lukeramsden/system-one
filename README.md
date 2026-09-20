# system-one

Typed decisions from System-1 models — TypeSafe **Jev** (directly or via **Cloudflare AI Gateway**) and **Laya** — with a Promise client and an **Effect** service sharing one set of question definitions.

You send **state** and **typed questions**; you get **typed answers with probabilities**; your code decides. The library never invents a probability, threshold, selected level, or model version it was not given.

```
pnpm add system-one                  # Promise API, zero runtime deps
pnpm add effect @effect/platform     # only for system-one/effect
```

Node ≥ 22.18, ESM only.

## Define questions

```ts
import { Question, defineQuestions } from "system-one";

const triage = defineQuestions({
  urgent: Question.boolean({
    instructions: "Does this need urgent attention?",
    criteria: { true: "Time-sensitive harm or an ongoing outage", false: "Routine request" },
  }),
  department: Question.choice({
    instructions: "Which department should handle this?",
    options: {
      billing: "Payments, refunds, invoices",
      technical: "Bugs, outages",
      sales: "Pricing",
    },
  }),
  frustration: Question.ordinal({
    instructions: "How frustrated is the customer?",
    levels: ["Calm", "Frustrated", "Very angry"],
  }),
});
```

Literal keys are preserved: `answers.department.value` is `"billing" | "technical" | "sales"`.

## Promise API

```ts
import { createClient } from "system-one";
import { jev } from "system-one/adapters/typesafe";

const client = createClient({
  model: jev({ apiKey: process.env.TYPESAFE_API_KEY!, model: "jev-1.13.0" }),
});

const result = await client.evaluate(
  { state: { message: "My payouts have failed for three days!" }, questions: triage },
  { signal, timeoutMs: 10_000 }, // optional
);

result.answers.department.value; // "billing" | "technical" | "sales"
result.answers.department.probabilities; // { billing: 0.87, technical: 0.13, sales: 0 } | undefined
result.answers.urgent.probabilityTrue; // 0.95 | undefined — you pick the threshold
result.answers.frustration.expectedIndex; // 1.04 — a position on your scale, not a selected level
result.model; // { adapter: "typesafe", requestedModel: "jev-1.13.0", resolvedModel: "jev-1.13.0" }
result.usage; // { inputTokens: 426, outputTokens: 73 } | undefined
```

Require distributions and the type tightens; if the adapter can't comply you get `UnsupportedCapability` before any network call:

```ts
const r = await client.evaluate({
  state,
  questions: triage,
  requirements: { probabilities: "required" },
});
r.answers.urgent.probabilityTrue; // number
```

One attempt per `evaluate`, no hidden retries. `AbortSignal` cancels the HTTP request.

## Effect API

```ts
import { Effect } from "effect";
import { FetchHttpClient } from "@effect/platform";
import { System1, layer } from "system-one/effect";
import { jev } from "system-one/adapters/typesafe";

const program = Effect.gen(function* () {
  const system1 = yield* System1;
  return yield* system1.evaluate({ state: { message: "…" }, questions: triage });
});

program.pipe(Effect.provide(layer(jev({ apiKey: "…" }))), Effect.provide(FetchHttpClient.layer));
```

Lazy and interruptible; `System1Error` in the error channel; any `HttpClient` can be injected. `testLayer({ capabilities, evaluate })` provides fixtures with full validation.

## Adapters

| Import                           | Constructor                                                               | Notes                                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `system-one/adapters/typesafe`   | `jev({ apiKey, model?, endpoint? })`                                      | Direct TypeSafe API.                                                                                                                                                                                 |
| `system-one/adapters/cloudflare` | `cloudflare({ accountId, apiToken, gatewayId?, model?: "typesafe/jev" })` | Cloudflare `/ai/run`; token needs Workers AI permission; needs gateway credits or BYOK. Routing verified, success path fixture-tested only ([details](specs/2026-09-19-cloudflare-route-status.md)). |
| `system-one/adapters/laya`       | `laya({ endpoint, model, apiKey? })`                                      | Your own bridge around `laya.predict()` — there is no public Laya HTTP API ([contract](specs/2026-09-19-laya-bridge-contract.md)).                                                                   |

Endpoints must be HTTPS (loopback HTTP allowed). To add a model: [docs/writing-an-adapter.md](docs/writing-an-adapter.md).

## Errors

All operational failures are `System1Error` with a `_tag`:

| `_tag`                  | When                                                    |
| ----------------------- | ------------------------------------------------------- |
| `InvalidRequest`        | bad state/definitions/requirements, or provider 400/422 |
| `UnsupportedCapability` | adapter cannot meet the requested contract              |
| `AuthenticationError`   | 401/403                                                 |
| `QuotaExceeded`         | 402, or Cloudflare has no credits/BYOK                  |
| `RateLimited`           | 429/529; `details.retryAfterMs` when provided           |
| `ContextLimitExceeded`  | 413                                                     |
| `TransportError`        | fetch failure or timeout                                |
| `InvalidResponse`       | provider output violates the answer contract            |
| `ProviderError`         | anything else upstream                                  |

Messages never contain credentials, state, or response bodies. Low confidence is a result, not an error. Retries are yours to compose — repeated inference can be billed again.

## Non-goals

No chat, streaming, batching, caching, routing, or LLM fallback. No truncation or request splitting. No calibration guarantee. No label↔probability conversion or cross-provider confidence normalisation. See [docs/semantics.md](docs/semantics.md).

## More

- [docs/semantics.md](docs/semantics.md) — what each answer field means
- [docs/writing-an-adapter.md](docs/writing-an-adapter.md) — add a model
- [specs/](specs/) — dated design decisions
- [CONTRIBUTING.md](CONTRIBUTING.md) — repo layout, verification, releasing

MIT © Luke Ramsden
