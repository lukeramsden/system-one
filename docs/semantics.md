# Answer semantics

`system1` normalises the _structure_ of model output, never its _certainty_. This page explains exactly what each field means and what the library refuses to invent. Snippets are compiled from [`docs/snippets.ts`](./snippets.ts).

## Question kinds

| Kind      | Ask                         | Definition                                                         |
| --------- | --------------------------- | ------------------------------------------------------------------ |
| `boolean` | a yes/no question           | `Question.boolean({ instructions, criteria?: { true, false } })`   |
| `choice`  | pick one of a named set     | `Question.choice({ instructions, options: { key: description } })` |
| `ordinal` | rate against ordered levels | `Question.ordinal({ instructions, levels: [lowest, …, highest] })` |

`instructions`, descriptions, and `state` are JSON (`string`, number, boolean, null, arrays, plain objects). Definitions are deep-copied and frozen when you build them; getters are not called, `toJSON` is ignored, and `undefined`, `NaN`, `Infinity`, bigint, `Date`, functions, and cycles are rejected with `InvalidRequest`.

TypeSafe's `noul`/`score` and Laya's identical names are wire formats handled by adapters — you never see them.

## Answers

### `boolean`

```ts
type BooleanAnswer = {
  kind: "boolean";
  probabilityTrue?: number;
  predictedValue?: boolean;
  confidence?: ReportedConfidence;
};
// at least one of probabilityTrue / predictedValue is present
```

- `probabilityTrue` is the model's reported P(yes), 0–1.
- `predictedValue` is present only if the _provider_ returned a decision. The library never applies a threshold for you.

```ts
const p = result.answers.urgent.probabilityTrue;
if (p !== undefined && p >= 0.9) escalate();
```

### `choice`

```ts
type ChoiceAnswer<K> = {
  kind: "choice";
  value: K;
  probabilities?: Record<K, number>;
  confidence?: ReportedConfidence;
};
```

- `value` is always one of your declared keys (`"billing" | "technical" | "sales"` in the example), enforced at runtime and in the type.
- `probabilities`, when present, has exactly your keys and sums to 1 (±0.001). It is never zero-filled or renormalised.

### `ordinal`

```ts
type OrdinalAnswer = {
  kind: "ordinal";
  selectedIndex?: number;
  expectedIndex?: number;
  probabilities?: number[];
  confidence?: ReportedConfidence;
};
// at least one of selectedIndex / expectedIndex / probabilities is present
```

- `selectedIndex` — an **integer** level the provider chose.
- `expectedIndex` — the provider's probability-weighted position on your scale, e.g. `1.04` between "Frustrated" (1) and "Very angry" (2). **It is not a selected level and is never rounded into one.**
- `probabilities` — one entry per level, in your declared order.

Need an argmax or an expectation from a distribution? Do it explicitly:

```ts
import { expectedIndex } from "system1";
const e = expectedIndex([0.05, 0.8, 0.15]); // 1.1 — derived by you, not reported by the model
```

## Probabilities vs confidence

- **Probabilities** describe outcomes. They are comparable across models only to the extent each model is calibrated on _your_ data — the library makes no calibration claim.
- **Confidence** is `{ value: 0..1, definition: string }`. `definition` names the provider's meaning (`typesafe:distribution-confidence`, `laya:reported-confidence`, …). Two confidences with different definitions are **not comparable**; do not reuse one threshold across providers without validating it.

Boolean answers from TypeSafe/Laya carry no confidence — the probability _is_ the answer.

## Requirements

```ts
await client.evaluate({ state, questions, requirements: { probabilities: "required" } });
```

- Checked against the adapter's `capabilities` **before** any HTTP call → `UnsupportedCapability` if it cannot comply.
- Checked against the actual response → `InvalidResponse` if the provider omitted a distribution.
- When passed as a literal, the result type drops `undefined` from `probabilityTrue` / `probabilities`.

Without the requirement, the fields stay optional — handle `undefined`.

## Metadata

| Field                  | Meaning                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `model.adapter`        | which adapter ran (`typesafe`, `cloudflare`, `laya-bridge-v1`, …)                  |
| `model.requestedModel` | what you configured (`jev-latest`, `typesafe/jev`, …)                              |
| `model.resolvedModel`  | the versioned id the provider reported (`jev-1.13.0`); absent if it did not        |
| `requestId`            | provider/gateway request id when a header supplied one                             |
| `usage`                | `{ inputTokens?, outputTokens?, totalTokens? }` — absent means unknown, never zero |

## What the library refuses to do

- Turn a label into a probability of 1, or a probability into a label.
- Treat confidence as the top-class probability.
- Round `expectedIndex` into `selectedIndex`.
- Zero-fill or renormalise distributions.
- Truncate state, drop questions, or split one request into many.
- Substitute another model, or retry, without you asking.
- Report unknown usage as `0` or invent a resolved model version from an alias.

Each of these would change a decision your code makes while hiding that it happened.
