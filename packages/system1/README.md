# system-one

Typed decisions from System-1-style models — TypeSafe **Jev** (directly or via **Cloudflare AI Gateway**) and **Laya** (via a bridge you run) — with a plain Promise client and an **Effect-native** service that share one set of question definitions.

`system-one` is a decision API, not a chat SDK. You send **state** and **typed questions**; you get back **typed answers with probabilities**; your code decides what to do. The library never invents a probability, a threshold, a selected level, or a model version it was not given.

```
pnpm add system-one                       # Promise API, zero runtime deps
pnpm add effect @effect/platform       # optional, only for system-one/effect
```

Node ≥ 22.18, ESM only.

## Define questions once

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

Definitions are validated, deep-copied, and frozen. Literal keys are preserved: `answers.department.value` is `"billing" | "technical" | "sales"`.

## Promise API

```ts
import { createClient } from "system-one";
import { jev } from "system-one/adapters/typesafe";

const client = createClient({
  model: jev({ apiKey: process.env.TYPESAFE_API_KEY!, model: "jev-1.13.0" }),
});

const result = await client.evaluate(
  { state: { message: "My payouts have failed for three days!" }, questions: triage },
  { signal: controller.signal, timeoutMs: 10_000 }, // both optional
);

result.answers.department.value; // "billing" | "technical" | "sales"
result.answers.department.probabilities; // { billing: 0.87, technical: 0.13, sales: 0 } | undefined
result.answers.urgent.probabilityTrue; // 0.95 | undefined — you pick the threshold
result.answers.frustration.expectedIndex; // 1.04 — a position on your scale, NOT a selected level
result.model; // { adapter: "typesafe", requestedModel: "jev-1.13.0", resolvedModel: "jev-1.13.0" }
result.usage; // { inputTokens: 426, outputTokens: 73 } | undefined
```

Need distributions guaranteed? Ask, and the type tightens:

```ts
const r = await client.evaluate({
  state,
  questions: triage,
  requirements: { probabilities: "required" },
});
r.answers.urgent.probabilityTrue; // number (not number | undefined)
```

If the adapter cannot deliver that, you get `UnsupportedCapability` **before** any network call.

One attempt per `evaluate`, no hidden retries, redirects refused. Cancellation via `AbortSignal` reaches the HTTP request.

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

const runnable = program.pipe(
  Effect.provide(layer(jev({ apiKey: "…" }))),
  Effect.provide(FetchHttpClient.layer), // or any HttpClient — tests inject their own
);
```

- Lazy; interruption cancels the in-flight HTTP request.
- `System1Error` in the error channel; adapter bugs stay defects.
- Span `system1.evaluate` with `system1.adapter` / `system1.model` attributes.
- `testLayer({ capabilities, evaluate })` for fixtures — still runs full validation, so tests cannot make invalid shapes look typed.

Swap the model by swapping the layer; the program does not change.

## Adapters

| Import                           | Constructor                                                               | Notes                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `system-one/adapters/typesafe`   | `jev({ apiKey, model?: "jev-latest", endpoint? })`                        | Direct `POST https://api.typesafe.ai/v1/systemone`. Confidence definition `typesafe:distribution-confidence`.                                                                                                                                                                                                    |
| `system-one/adapters/cloudflare` | `cloudflare({ accountId, apiToken, gatewayId?, model?: "typesafe/jev" })` | Universal `POST …/ai/run` envelope; `gatewayId` → `cf-aig-gateway-id`. Token needs **Workers AI** permission. Classifies code `2021` (no credits/BYOK) as `QuotaExceeded`. **Routing verified; a funded success response has not been observed yet** — see [specs](specs/2026-09-19-cloudflare-route-status.md). |
| `system-one/adapters/laya`       | `laya({ endpoint, model, apiKey? })`                                      | Talks to **your own bridge** speaking the `system1-laya-v1` contract around `laya.predict()`. There is no public Laya HTTP API — see [specs](specs/2026-09-19-laya-bridge-contract.md).                                                                                                                          |

All endpoints must be HTTPS (HTTP allowed on loopback only). Credentials live in closures; `JSON.stringify(adapter)` never contains them.

Write your own: [docs/writing-an-adapter.md](docs/writing-an-adapter.md).

## Errors

Everything operational is a `System1Error` with a `_tag`:

| `_tag`                  | When                                                      |
| ----------------------- | --------------------------------------------------------- |
| `InvalidRequest`        | bad state/definitions/requirements, or provider 400/422   |
| `UnsupportedCapability` | adapter cannot meet the requested contract                |
| `AuthenticationError`   | 401/403, Cloudflare `10000`                               |
| `QuotaExceeded`         | 402, Cloudflare `2021`                                    |
| `RateLimited`           | 429/529 — `details.retryAfterMs` when the header is valid |
| `ContextLimitExceeded`  | 413                                                       |
| `TransportError`        | fetch failure or timeout (fixed message, no leak)         |
| `InvalidResponse`       | provider output violates the answer contract              |
| `ProviderError`         | anything else upstream                                    |

Messages are fixed strings; `details` never contains headers, bodies, state, or tokens. Low confidence is a **result**, not an error. Retries are yours to compose (e.g. `Effect.retry` keyed on `_tag`) — repeating inference can be billed again.

## What it deliberately does not do

No chat, streaming, tool calling, batching, caching, routing, or LLM fallback. No truncation, question dropping, or request splitting. No calibration guarantee. No label→probability or probability→label conversion. No cross-provider confidence normalisation. Details: [docs/semantics.md](docs/semantics.md).

## Repository

```
packages/system1   the published package
examples/triage    runnable example: same questions through Promise and Effect (`pnpm example`)
docs/              writing-an-adapter.md, semantics.md, snippets.ts (type-checked)
specs/             dated design decisions (YYYY-MM-DD-*.md)
scripts/smoke.mjs  packs the tarball and imports it from a fresh consumer, with and without Effect
```

```
pnpm install
pnpm verify        # check + typecheck + test + build + example + smoke
```

### Publishing

Releases are tag-driven via [`.github/workflows/publish.yml`](.github/workflows/publish.yml). From a clean, green `master`:

```
# 1. bump packages/system1/package.json version and add a CHANGELOG.md entry, commit
# 2. tag with the same semver, prefixed v
git tag v0.1.0 && git push origin master v0.1.0
```

The workflow checks the tag matches `package.json`, runs `pnpm verify`, publishes `system-one` to npm with provenance (pre-release tags → `next` dist-tag), and creates a GitHub Release from the matching CHANGELOG section.

Auth is npm **trusted publishing** (OIDC; configure the repo/workflow as a trusted publisher on npmjs.com), or a repository secret `NPM_TOKEN` as fallback.

### Live checks

Tests are offline. Live inference against TypeSafe (needs `TYPESAFE_API_KEY`) and Cloudflare (needs Unified Billing credits or a BYOK key) has **not** been run in this repository and is tracked as blocked, not passed.

MIT © Luke Ramsden
