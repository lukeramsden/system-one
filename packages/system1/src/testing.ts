import type {
  Answers,
  Capabilities,
  DecodedEvaluation,
  EvaluationRequest,
  Questions,
  Usage,
} from "./core.js";
import type { LocalModel } from "./adapter.js";

export type { LocalModel } from "./adapter.js";

/**
 * Default stub contract: every kind with probabilities, no confidence.
 * Advertising a field obliges every answer to carry it, so this keeps simple stubs simple.
 */
export const stubCapabilities: Capabilities = Object.freeze({
  kinds: {
    boolean: { probabilities: true, confidence: false },
    choice: { probabilities: true, confidence: false },
    ordinal: { probabilities: true, confidence: false },
  },
  state: "json",
  descriptions: "json",
});

/** Every kind with probabilities and confidence. Every answer must then include `confidence`. */
export const fullCapabilities: Capabilities = Object.freeze({
  kinds: {
    boolean: { probabilities: true, confidence: true },
    choice: { probabilities: true, confidence: true },
    ordinal: { probabilities: true, confidence: true },
  },
  state: "json",
  descriptions: "json",
});

export type StubAnswers = DecodedEvaluation["answers"];

interface StubBase {
  /** Defaults to `stubCapabilities`. Use `fullCapabilities` when answers carry confidence; narrow it to test `UnsupportedCapability` paths. */
  readonly capabilities?: Capabilities;
  readonly id?: string;
  readonly model?: string;
  readonly resolvedModel?: string;
  readonly usage?: Usage;
}
/** Typed stub: `questions` makes wrong keys, kinds, or choice values a compile error. */
export interface TypedStubOptions<Q extends Questions> extends StubBase {
  readonly questions: Q;
  readonly answers?: Answers<Q>;
  /** Compute answers from the prepared request. May throw `System1Error`. */
  readonly respond?: (request: EvaluationRequest<Q>) => Answers<Q> | Promise<Answers<Q>>;
}
/** Untyped stub: answers are only checked at runtime. */
export interface UntypedStubOptions extends StubBase {
  readonly questions?: undefined;
  readonly answers?: StubAnswers;
  readonly respond?: (request: EvaluationRequest) => StubAnswers | Promise<StubAnswers>;
}

export interface StubModel extends LocalModel {
  /** Every prepared request this stub has received, oldest first. */
  readonly calls: readonly EvaluationRequest[];
  /** Forget recorded calls. */
  reset(): void;
}

/**
 * In-process stand-in for a real model. Works with `createClient({ model })` and
 * `layer(model)` alike, with no HTTP or fake fetch. Full request preparation and
 * result validation still run, so a stub cannot make an invalid shape look typed.
 *
 * Throw a `System1Error` from `respond` to simulate a documented provider failure.
 */
export function stubModel<const Q extends Questions>(options: TypedStubOptions<Q>): StubModel;
export function stubModel(options: UntypedStubOptions): StubModel;
export function stubModel(options: TypedStubOptions<Questions> | UntypedStubOptions): StubModel {
  if ((options.answers === undefined) === (options.respond === undefined))
    throw new TypeError("stubModel: provide exactly one of `answers` or `respond`");
  const respond: (request: EvaluationRequest) => unknown =
    options.respond !== undefined
      ? (options.respond as (request: EvaluationRequest) => unknown)
      : () => options.answers;
  const calls: EvaluationRequest[] = [];
  return {
    id: options.id ?? "stub",
    model: options.model ?? "stub-1",
    capabilities: options.capabilities ?? stubCapabilities,
    calls,
    reset: () => {
      calls.length = 0;
    },
    async evaluate(request) {
      calls.push(request);
      const resolved = await respond(request);
      return {
        answers: resolved,
        ...(options.resolvedModel ? { resolvedModel: options.resolvedModel } : {}),
        ...(options.usage ? { usage: options.usage } : {}),
      };
    },
  };
}
