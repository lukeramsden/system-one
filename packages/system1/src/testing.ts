import type { Capabilities, DecodedEvaluation, EvaluationRequest, Usage } from "./core.js";
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
export interface StaticStubOptions extends StubBase {
  /** Fixed answers for every request. */
  readonly answers: StubAnswers;
}
export interface DynamicStubOptions extends StubBase {
  /** Compute answers from the prepared request (e.g. switch on state). May throw `System1Error`. */
  readonly respond: (request: EvaluationRequest) => StubAnswers | Promise<StubAnswers>;
}
export type StubOptions = StaticStubOptions | DynamicStubOptions;

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
export function stubModel(options: StubOptions): StubModel {
  const calls: EvaluationRequest[] = [];
  const respond = "respond" in options ? options.respond : (): StubAnswers => options.answers;
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
