# 2026-09-19 — Answer semantics and the no-fabrication rule

Status: accepted for 0.1. Supersedes draft SPEC sections 4, 6, 7, 8, 9, 15.

## Context

System-1-style models return different mixes of information: a selected label, a probability distribution, a provider-defined confidence, a numeric expectation, or some combination. A generic client that flattens these into one shape either invents data or hides differences that change application decisions.

## Decision

### Primitives

Three provider-neutral question kinds: `boolean`, `choice`, `ordinal`. TypeSafe's `noul`/`score` and Laya's identical wire names are adapter details, never public kinds. A continuous regression score is a different primitive and is out of scope.

Definitions are validated and deep-copied at construction (`Question.*`, `defineQuestions`). Copies are frozen; later caller mutation cannot change an in-flight request. Getters are never invoked; `toJSON` is ignored; non-finite numbers, `undefined`, bigint, symbols, dates, functions, cycles, sparse or augmented arrays, and non-plain prototypes are rejected. Keys such as `__proto__` are handled by own-property checks, never by prototype-bearing merges.

Constraints: at least one nonempty question name; choice needs ≥2 nonempty keys; ordinal needs ≥2 levels; boolean criteria are optional but, when present, must provide both `true` and `false`. Level order is significant.

### Answers

- `BooleanAnswer`: at least one of `probabilityTrue` or `predictedValue`. Adapters never derive one from the other. Applications apply their own threshold.
- `ChoiceAnswer<K>`: `value` must be a declared key. `probabilities`, when present, covers exactly the declared keys. Sparse distributions are not zero-filled unless a provider contract explicitly gives omission that meaning (none do today).
- `OrdinalAnswer`: `selectedIndex` (integer), `expectedIndex` (real, provider-reported), and `probabilities` (aligned with level order) are distinct. At least one substantive field is required; confidence alone is not an answer. `expectedIndex` is never rounded into a selection. `expectedIndex(probabilities)` is exported as an explicitly derived helper.
- `confidence` is `{ value, definition }`. `definition` is a stable identifier for the provider's meaning (e.g. `typesafe:distribution-confidence`). Values from different definitions are not comparable.

### Metadata

`model.requestedModel` is what the caller asked for; `resolvedModel` appears only when the provider reports it. Missing `usage` means unknown, not zero. `requestId` is provider-supplied. Cost is never computed from hardcoded prices. Raw provider bodies are never attached to results or errors.

### Validation

Response validation runs after every adapter, in both runtimes, before the question-specific type is recovered. It rejects: missing or unexpected answer keys, kind mismatches, unknown choice values, non-finite or out-of-range probabilities, distributions whose sum differs from 1 by more than `DISTRIBUTION_TOLERANCE` (0.001, never renormalised), wrong-length ordinal distributions, out-of-range indices, missing confidence when the adapter advertises it, missing probabilities when required or advertised, and invalid usage/metadata.

### Requirements

`requirements: { probabilities: "required" }` is checked statically against adapter capabilities before any HTTP call (`UnsupportedCapability`) and again against the response (`InvalidResponse`). When the requirement is a literal, the result type drops optionality on the probability fields.

## Consequences

Portable definitions; no silent degradation; some providers' extras (e.g. TypeSafe's `legend`) are verified against the request rather than surfaced. Applications must handle `undefined` probabilities unless they require them.
