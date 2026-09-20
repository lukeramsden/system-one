import { fail } from "./errors.js";
export { System1Error, isSystem1Error } from "./errors.js";
export type { ErrorTag, ErrorDetails } from "./errors.js";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
export type Description = JsonValue;
export type Kind = "boolean" | "choice" | "ordinal";
export interface BooleanQuestion {
  readonly kind: "boolean";
  readonly instructions: Description;
  readonly criteria?: { readonly true: Description; readonly false: Description };
}
export interface ChoiceQuestion<K extends string = string> {
  readonly kind: "choice";
  readonly instructions: Description;
  readonly options: Readonly<Record<K, Description>>;
}
export interface OrdinalQuestion {
  readonly kind: "ordinal";
  readonly instructions: Description;
  readonly levels: readonly Description[];
}
export type QuestionDefinition = BooleanQuestion | ChoiceQuestion | OrdinalQuestion;
export type Questions = Readonly<Record<string, QuestionDefinition>>;

/** Copy plain JSON without invoking getters or toJSON; reject lossy serialization. */
export function snapshot(
  value: unknown,
  tag: "InvalidRequest" | "InvalidResponse" = "InvalidRequest",
): JsonValue {
  const active = new Set<object>();
  function visit(input: unknown, depth: number): JsonValue {
    if (depth > 100) return fail(tag, "JSON nesting exceeds 100 levels");
    if (input === null || typeof input === "string" || typeof input === "boolean") return input;
    if (typeof input === "number" && Number.isFinite(input)) return input;
    if (typeof input !== "object" || input === null)
      return fail(tag, "Expected a finite, plain JSON value");
    if (active.has(input)) return fail(tag, "Cyclic JSON is not supported");
    if (
      !Array.isArray(input) &&
      Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null
    ) {
      return fail(tag, "Only plain objects and arrays are supported");
    }
    active.add(input);
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Object.getOwnPropertySymbols(input).length) return fail(tag, "Symbol keys are not JSON");
    const entries: [string, JsonValue][] = [];
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (Array.isArray(input) && key === "length") continue;
      if (!descriptor.enumerable || !("value" in descriptor))
        return fail(tag, "JSON properties must be enumerable data properties");
      entries.push([key, visit(descriptor.value, depth + 1)]);
    }
    let output: JsonValue;
    if (Array.isArray(input)) {
      if (entries.length !== input.length || entries.some(([key], i) => key !== String(i)))
        return fail(tag, "Sparse or augmented arrays are not JSON");
      output = entries.map(([, item]) => item);
    } else output = Object.fromEntries(entries);
    active.delete(input);
    return Object.freeze(output);
  }
  return visit(value, 0);
}

export function record(
  value: unknown,
  tag: "InvalidRequest" | "InvalidResponse" = "InvalidResponse",
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return fail(tag, "Expected an object");
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  tag: "InvalidRequest" | "InvalidResponse",
): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail(tag, "Unexpected fields");
}
function own(value: object, key: PropertyKey): boolean {
  return Object.hasOwn(value, key);
}
function validateQuestion(value: unknown): void {
  const q = record(value, "InvalidRequest");
  if (!own(q, "instructions")) fail("InvalidRequest", "Question instructions are required");
  switch (q.kind) {
    case "boolean": {
      exactKeys(q, ["kind", "instructions", "criteria"], "InvalidRequest");
      if (q.criteria !== undefined) {
        const criteria = record(q.criteria, "InvalidRequest");
        exactKeys(criteria, ["true", "false"], "InvalidRequest");
        if (!own(criteria, "true") || !own(criteria, "false"))
          fail("InvalidRequest", "Boolean criteria need true and false descriptions");
      }
      break;
    }
    case "choice": {
      exactKeys(q, ["kind", "instructions", "options"], "InvalidRequest");
      const keys = Object.keys(record(q.options, "InvalidRequest"));
      if (keys.length < 2 || keys.some((key) => !key.trim()))
        fail("InvalidRequest", "Choice questions need at least two nonempty keys");
      break;
    }
    case "ordinal":
      exactKeys(q, ["kind", "instructions", "levels"], "InvalidRequest");
      if (!Array.isArray(q.levels) || q.levels.length < 2)
        fail("InvalidRequest", "Ordinal questions need at least two levels");
      break;
    default:
      fail("InvalidRequest", "Unknown question kind");
  }
}
function question<T extends QuestionDefinition>(input: T): T {
  const copy = snapshot(input);
  validateQuestion(copy);
  return copy as unknown as T;
}
export const Question = {
  boolean: (input: Omit<BooleanQuestion, "kind">): BooleanQuestion =>
    question({ ...input, kind: "boolean" }),
  choice: <const O extends Readonly<Record<string, Description>>>(input: {
    readonly instructions: Description;
    readonly options: O;
  }): ChoiceQuestion<Extract<keyof O, string>> => question({ ...input, kind: "choice" }),
  ordinal: (input: Omit<OrdinalQuestion, "kind">): OrdinalQuestion =>
    question({ ...input, kind: "ordinal" }),
} as const;

export function defineQuestions<const Q extends Questions>(input: Q): Q {
  const copy = record(snapshot(input), "InvalidRequest");
  const keys = Object.keys(copy);
  if (!keys.length || keys.some((key) => !key.trim()))
    fail("InvalidRequest", "At least one nonempty question name is required");
  for (const item of Object.values(copy)) validateQuestion(item);
  return copy as Q;
}

export interface ReportedConfidence {
  readonly value: number;
  readonly definition: string;
}
type Confidence = { readonly confidence?: ReportedConfidence };
export type BooleanAnswer = Confidence & { readonly kind: "boolean" } & (
    | { readonly probabilityTrue: number; readonly predictedValue?: boolean }
    | { readonly probabilityTrue?: number; readonly predictedValue: boolean }
  );
export interface ChoiceAnswer<K extends string = string> extends Confidence {
  readonly kind: "choice";
  readonly value: K;
  readonly probabilities?: Readonly<Record<K, number>>;
}
export type OrdinalAnswer = Confidence & { readonly kind: "ordinal" } & (
    | {
        readonly selectedIndex: number;
        readonly expectedIndex?: number;
        readonly probabilities?: readonly number[];
      }
    | {
        readonly selectedIndex?: number;
        readonly expectedIndex: number;
        readonly probabilities?: readonly number[];
      }
    | {
        readonly selectedIndex?: number;
        readonly expectedIndex?: number;
        readonly probabilities: readonly number[];
      }
  );
export interface Requirements {
  readonly probabilities?: "required";
}
export type AnswerFor<
  Q extends QuestionDefinition,
  R extends Requirements = {},
> = Q extends BooleanQuestion
  ? BooleanAnswer &
      (R extends { probabilities: "required" } ? { readonly probabilityTrue: number } : {})
  : Q extends ChoiceQuestion<infer K>
    ? ChoiceAnswer<K> &
        (R extends { probabilities: "required" }
          ? { readonly probabilities: Readonly<Record<K, number>> }
          : {})
    : OrdinalAnswer &
        (R extends { probabilities: "required" }
          ? { readonly probabilities: readonly number[] }
          : {});
export type Answers<Q extends Questions, R extends Requirements = {}> = {
  readonly [K in keyof Q]: AnswerFor<Q[K], R>;
};
export interface EvaluationRequest<
  Q extends Questions = Questions,
  R extends Requirements = Requirements,
> {
  readonly state: JsonValue;
  readonly questions: Q;
  readonly requirements?: R;
}
export interface EvaluationResult<Q extends Questions, R extends Requirements = {}> {
  readonly answers: Answers<Q, R>;
  readonly model: {
    readonly adapter: string;
    readonly requestedModel: string;
    readonly resolvedModel?: string;
  };
  readonly requestId?: string;
  readonly usage?: Usage;
}
export interface Usage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}
export interface KindCapability {
  readonly probabilities: boolean;
  readonly confidence: boolean;
}
export interface Capabilities {
  readonly kinds: Readonly<Partial<Record<Kind, KindCapability>>>;
  readonly state: "json" | "text-or-structured" | "text";
  readonly descriptions: "json" | "text";
  readonly maxQuestions?: number;
  /** Informational only. No tokenizer is assumed; providers enforce token limits. */
  readonly context?: readonly { readonly scope: string; readonly tokens: number }[];
}

export function prepare<Q extends Questions, R extends Requirements>(
  request: EvaluationRequest<Q, R>,
  capabilities: Capabilities,
): EvaluationRequest<Q, R> {
  const copy = record(snapshot(request), "InvalidRequest");
  exactKeys(copy, ["state", "questions", "requirements"], "InvalidRequest");
  if (!own(copy, "state")) fail("InvalidRequest", "State is required");
  const questions = defineQuestions(copy.questions as Q);
  if (copy.requirements !== undefined) {
    const req = record(copy.requirements, "InvalidRequest");
    exactKeys(req, ["probabilities"], "InvalidRequest");
    if (req.probabilities !== undefined && req.probabilities !== "required")
      fail("InvalidRequest", "Unknown probability requirement");
  }
  if (capabilities.state === "text" && typeof copy.state !== "string")
    fail("UnsupportedCapability", "Model requires text state");
  if (
    capabilities.state === "text-or-structured" &&
    (copy.state === null || typeof copy.state === "number" || typeof copy.state === "boolean")
  )
    fail("UnsupportedCapability", "Model requires text, object, or array state");
  if (
    capabilities.maxQuestions !== undefined &&
    Object.keys(questions).length > capabilities.maxQuestions
  )
    fail("UnsupportedCapability", "Too many questions for model");
  for (const q of Object.values(questions)) {
    const capability = capabilities.kinds[q.kind];
    if (!capability) fail("UnsupportedCapability", "Unsupported question kind");
    if (
      (copy.requirements as Requirements | undefined)?.probabilities === "required" &&
      !capability.probabilities
    )
      fail("UnsupportedCapability", "Model does not provide required probabilities");
    if (capabilities.descriptions === "text") {
      const descriptions = [
        q.instructions,
        ...(q.kind === "choice"
          ? Object.values(q.options)
          : q.kind === "ordinal"
            ? q.levels
            : Object.values(q.criteria ?? {})),
      ];
      if (descriptions.some((x) => typeof x !== "string"))
        fail("UnsupportedCapability", "Model requires text descriptions");
    }
  }
  return Object.freeze({ ...copy, questions }) as unknown as EvaluationRequest<Q, R>;
}

function probability(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
    fail("InvalidResponse", "Invalid probability");
}
/** Absolute sum tolerance; never renormalizes a distribution. */
export const DISTRIBUTION_TOLERANCE = 0.001;
function distribution(values: unknown[]): void {
  values.forEach(probability);
  if (Math.abs((values as number[]).reduce((a, b) => a + b, 0) - 1) > DISTRIBUTION_TOLERANCE)
    fail("InvalidResponse", "Probabilities do not sum to one");
}
function matchingKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !own(value, key)))
    fail("InvalidResponse", "Answer keys do not match the request");
}
export interface DecodedEvaluation {
  readonly answers: unknown;
  readonly resolvedModel?: string;
  readonly requestId?: string;
  readonly usage?: EvaluationResult<Questions>["usage"];
}

/** Validates untrusted normalized output before recovering question-specific types. */
export function validateResult<const Q extends Questions, const R extends Requirements>(
  request: EvaluationRequest<Q, R>,
  decoded: DecodedEvaluation,
  identity: { readonly adapter: string; readonly model: string },
  capabilities: Capabilities,
): EvaluationResult<Q, R> {
  const safe = record(snapshot(decoded, "InvalidResponse"));
  exactKeys(safe, ["answers", "resolvedModel", "requestId", "usage"], "InvalidResponse");
  const answers = record(safe.answers);
  matchingKeys(answers, Object.keys(request.questions));
  for (const [key, q] of Object.entries(request.questions)) {
    const a = record(answers[key]);
    if (a.kind !== q.kind) fail("InvalidResponse", "Answer kind does not match question");
    if (a.confidence !== undefined) {
      const c = record(a.confidence);
      exactKeys(c, ["value", "definition"], "InvalidResponse");
      probability(c.value);
      if (typeof c.definition !== "string" || !c.definition.trim())
        fail("InvalidResponse", "Confidence needs a definition");
    } else if (capabilities.kinds[q.kind]?.confidence)
      fail("InvalidResponse", "Missing advertised confidence");
    const required =
      request.requirements?.probabilities === "required" ||
      capabilities.kinds[q.kind]?.probabilities;
    if (q.kind === "boolean") {
      exactKeys(a, ["kind", "probabilityTrue", "predictedValue", "confidence"], "InvalidResponse");
      if (a.probabilityTrue !== undefined) probability(a.probabilityTrue);
      else if (required) fail("InvalidResponse", "Missing probability of true");
      if (a.predictedValue !== undefined && typeof a.predictedValue !== "boolean")
        fail("InvalidResponse", "Invalid boolean prediction");
      if (a.probabilityTrue === undefined && a.predictedValue === undefined)
        fail("InvalidResponse", "Empty boolean answer");
    } else if (q.kind === "choice") {
      exactKeys(a, ["kind", "value", "probabilities", "confidence"], "InvalidResponse");
      if (typeof a.value !== "string" || !own(q.options, a.value))
        fail("InvalidResponse", "Unknown choice value");
      if (a.probabilities !== undefined) {
        const probabilities = record(a.probabilities);
        matchingKeys(probabilities, Object.keys(q.options));
        distribution(Object.values(probabilities));
      } else if (required) fail("InvalidResponse", "Missing choice probabilities");
    } else {
      exactKeys(
        a,
        ["kind", "selectedIndex", "expectedIndex", "probabilities", "confidence"],
        "InvalidResponse",
      );
      for (const field of ["selectedIndex", "expectedIndex"]) {
        const n = a[field];
        if (
          n !== undefined &&
          (typeof n !== "number" ||
            !Number.isFinite(n) ||
            n < 0 ||
            n > q.levels.length - 1 ||
            (field === "selectedIndex" && !Number.isInteger(n)))
        )
          fail("InvalidResponse", "Invalid ordinal index");
      }
      if (a.probabilities !== undefined) {
        if (!Array.isArray(a.probabilities) || a.probabilities.length !== q.levels.length)
          fail("InvalidResponse", "Ordinal distribution has wrong length");
        distribution(a.probabilities);
      } else if (required) fail("InvalidResponse", "Missing ordinal probabilities");
      if (
        a.selectedIndex === undefined &&
        a.expectedIndex === undefined &&
        a.probabilities === undefined
      )
        fail("InvalidResponse", "Empty ordinal answer");
    }
  }
  for (const key of ["resolvedModel", "requestId"]) {
    if (safe[key] !== undefined && (typeof safe[key] !== "string" || !safe[key].trim()))
      fail("InvalidResponse", "Invalid response metadata");
  }
  if (safe.usage !== undefined) {
    const usage = record(safe.usage);
    exactKeys(usage, ["inputTokens", "outputTokens", "totalTokens"], "InvalidResponse");
    for (const n of Object.values(usage))
      if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0)
        fail("InvalidResponse", "Invalid token usage");
  }
  return Object.freeze({
    answers,
    model: Object.freeze({
      adapter: identity.adapter,
      requestedModel: identity.model,
      ...(safe.resolvedModel === undefined ? {} : { resolvedModel: safe.resolvedModel }),
    }),
    ...(safe.requestId === undefined ? {} : { requestId: safe.requestId }),
    ...(safe.usage === undefined ? {} : { usage: safe.usage }),
  }) as unknown as EvaluationResult<Q, R>;
}

/** Explicit derived statistic, not a provider-reported prediction. */
export function expectedIndex(probabilities: readonly number[]): number {
  if (probabilities.length < 2) fail("InvalidRequest", "At least two levels are required");
  distribution([...probabilities]);
  return probabilities.reduce((sum, p, i) => sum + p * i, 0);
}
