import { record } from "../core.js";
import type { Capabilities, DecodedEvaluation, EvaluationRequest } from "../core.js";
import { System1Error } from "../errors.js";

export const typedCapabilities: Capabilities = Object.freeze({
  kinds: Object.freeze({
    boolean: Object.freeze({ probabilities: true, confidence: false }),
    choice: Object.freeze({ probabilities: true, confidence: true }),
    ordinal: Object.freeze({ probabilities: true, confidence: true }),
  }),
  state: "text-or-structured",
  descriptions: "json",
});

export function encodeQuestions(request: EvaluationRequest): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(request.questions).map(([key, q]) => [
      key,
      {
        type: q.kind === "boolean" ? "noul" : q.kind === "ordinal" ? "score" : "choice",
        instructions: q.instructions,
        ...(q.kind === "boolean"
          ? q.criteria === undefined
            ? {}
            : { criteria: q.criteria }
          : { criteria: q.kind === "choice" ? q.options : q.levels }),
      },
    ]),
  );
}

/** Shared shape, but confidence identities remain provider-specific. */
export function decodeTyped(
  body: unknown,
  request: EvaluationRequest,
  confidenceDefinition: string,
): DecodedEvaluation {
  const data = record(body);
  const answers = record(data.answers);
  const normalized = Object.fromEntries(
    Object.entries(answers).map(([key, value]) => {
      const a = record(value);
      const q = Object.hasOwn(request.questions, key) ? request.questions[key] : undefined;
      if (!q) throw new System1Error("InvalidResponse", "Unexpected answer key");
      const expectedType =
        q.kind === "boolean" ? "noul" : q.kind === "ordinal" ? "score" : "choice";
      if (a.type !== expectedType)
        throw new System1Error("InvalidResponse", "Provider returned wrong answer type");
      const confidence =
        a.confidence === undefined
          ? {}
          : { confidence: { value: a.confidence, definition: confidenceDefinition } };
      if (q.kind === "boolean")
        return [key, { kind: "boolean", probabilityTrue: a.noul, ...confidence }];
      if (q.kind === "choice")
        return [
          key,
          { kind: "choice", value: a.choice, probabilities: a.probabilities, ...confidence },
        ];
      const probabilities = record(a.probabilities);
      const indices = q.levels.map((_, i) => String(i));
      if (
        Object.keys(probabilities).length !== indices.length ||
        indices.some((i) => !Object.hasOwn(probabilities, i))
      )
        throw new System1Error("InvalidResponse", "Invalid ordinal probability keys");
      // A supplied legend must refer to the original scale, not another rubric.
      if (a.legend !== undefined) {
        const legend = record(a.legend);
        if (
          Object.keys(legend).length !== indices.length ||
          indices.some(
            (i) => !Object.hasOwn(legend, i) || !sameJson(legend[i], q.levels[Number(i)]),
          )
        )
          throw new System1Error("InvalidResponse", "Ordinal legend differs from requested scale");
      }
      return [
        key,
        {
          kind: "ordinal",
          expectedIndex: a.score,
          probabilities: indices.map((i) => probabilities[i]),
          ...confidence,
        },
      ];
    }),
  );
  const usage = data.usage === undefined ? undefined : record(data.usage);
  return {
    answers: normalized,
    ...(data.model === undefined ? {} : { resolvedModel: data.model as string }),
    ...(usage === undefined
      ? {}
      : {
          usage: {
            ...(usage.input_tokens === undefined
              ? {}
              : { inputTokens: usage.input_tokens as number }),
            ...(usage.output_tokens === undefined
              ? {}
              : { outputTokens: usage.output_tokens as number }),
            ...(usage.total_tokens === undefined
              ? {}
              : { totalTokens: usage.total_tokens as number }),
          },
        }),
  };
}
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    !a ||
    !b ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((k) => Object.hasOwn(right, k) && sameJson(left[k], right[k]))
  );
}
