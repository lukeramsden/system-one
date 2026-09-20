import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import {
  Question,
  defineQuestions,
  prepare,
  validateResult,
  snapshot,
  expectedIndex,
} from "./core.js";
import type { Capabilities, Answers, Requirements } from "./core.js";
import { createClient } from "./client.js";

export const questions = defineQuestions({
  urgent: Question.boolean({ instructions: "Urgent?" }),
  team: Question.choice({ instructions: "Team?", options: { billing: "Money", tech: "Bugs" } }),
  mood: Question.ordinal({ instructions: "Mood?", levels: ["Calm", "Angry"] }),
});
export const capabilities: Capabilities = {
  kinds: {
    boolean: { probabilities: false, confidence: false },
    choice: { probabilities: false, confidence: false },
    ordinal: { probabilities: false, confidence: false },
  },
  state: "json",
  descriptions: "json",
};
const request = { state: "Hi", questions };
const answers = {
  urgent: { kind: "boolean", probabilityTrue: 0.8 },
  team: { kind: "choice", value: "billing", probabilities: { billing: 0.7, tech: 0.3 } },
  mood: { kind: "ordinal", expectedIndex: 0.6, probabilities: [0.4, 0.6] },
};
function validate(value: unknown) {
  return validateResult(
    request,
    { answers: value },
    { adapter: "test", model: "test" },
    capabilities,
  );
}

describe("definitions", () => {
  it("preserves literal keys and requirements", () => {
    type A = Answers<typeof questions>;
    expectTypeOf<A["team"]["value"]>().toEqualTypeOf<"billing" | "tech">();
    expectTypeOf<A["team"]["probabilities"]>().toEqualTypeOf<
      Readonly<Record<"billing" | "tech", number>> | undefined
    >();
    type Required = Answers<typeof questions, { probabilities: "required" }>;
    expectTypeOf<Required["urgent"]["probabilityTrue"]>().toEqualTypeOf<number>();
    expectTypeOf<Answers<typeof questions, Requirements>["team"]["probabilities"]>().toEqualTypeOf<
      A["team"]["probabilities"]
    >();
    // @ts-expect-error no invented question key
    type Missing = A["missing"];
    expectTypeOf<Missing>().toBeAny();
    const client = createClient({
      model: {
        id: "test",
        model: "test",
        capabilities,
        encode: () => {
          throw Error();
        },
        decode: () => ({ answers }),
      },
    });
    type Inferred = Awaited<
      ReturnType<typeof client.evaluate<typeof questions, { probabilities: "required" }>>
    >;
    expectTypeOf<Inferred["answers"]["team"]["value"]>().toEqualTypeOf<"billing" | "tech">();
  });
  it.each([
    undefined,
    NaN,
    Infinity,
    1n,
    new Date(),
    () => {},
    Symbol(),
    Object.assign([1], { extra: 2 }),
    { value: undefined },
  ])("rejects non-JSON %#", (value) => expect(() => snapshot(value)).toThrow());
  it("rejects cycles and getters without invoking them", () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(() => snapshot(cycle)).toThrow();
    let called = false;
    expect(() =>
      snapshot({
        get secret() {
          called = true;
          return "secret";
        },
      }),
    ).toThrow();
    expect(called).toBe(false);
  });
  it("copies and freezes nested inputs", () => {
    const source = { a: { b: [1] } };
    const copy = snapshot(source);
    source.a.b.push(2);
    expect(copy).toEqual({ a: { b: [1] } });
    expect(Object.isFrozen((copy as typeof source).a.b)).toBe(true);
  });
  it("rejects empty or invalid questions", () => {
    expect(() => defineQuestions({})).toThrow();
    expect(() => Question.choice({ instructions: "?", options: { one: null } })).toThrow();
    expect(() => Question.ordinal({ instructions: "?", levels: ["one"] })).toThrow();
  });
  it("handles prototype-like question and option keys", () => {
    const q = defineQuestions({
      ["__proto__"]: Question.choice({
        instructions: "?",
        options: { ["__proto__"]: null, constructor: null },
      }),
    });
    const result = validateResult(
      { state: null, questions: q },
      { answers: { ["__proto__"]: { kind: "choice", value: "__proto__" } } },
      { adapter: "test", model: "test" },
      capabilities,
    );
    expect(result.answers["__proto__"].value).toBe("__proto__");
    expect({}).not.toHaveProperty("polluted");
  });
});
describe("semantic validation", () => {
  it("preserves expected index without inventing selection", () => {
    const result = validate(answers);
    expect(result.answers.mood.expectedIndex).toBe(0.6);
    expect(result.answers.mood.selectedIndex).toBeUndefined();
    expect(result.model.resolvedModel).toBeUndefined();
    expect(result.usage).toBeUndefined();
  });
  it.each([
    {},
    { ...answers, extra: {} },
    { ...answers, urgent: {} },
    { ...answers, urgent: { kind: "boolean", probabilityTrue: 1.1 } },
    { ...answers, urgent: { kind: "boolean", probabilityTrue: NaN } },
    { ...answers, team: { kind: "choice", value: "other" } },
    { ...answers, team: { kind: "choice", value: "tech", probabilities: { tech: 1 } } },
    {
      ...answers,
      team: { kind: "choice", value: "tech", probabilities: { tech: 0.8, billing: 0.8 } },
    },
    { ...answers, mood: { kind: "ordinal", selectedIndex: 0.5 } },
    { ...answers, mood: { kind: "ordinal", expectedIndex: 2 } },
    { ...answers, mood: { kind: "ordinal", probabilities: [1] } },
    {
      ...answers,
      urgent: { kind: "boolean", predictedValue: true, confidence: { value: 0.9, definition: "" } },
    },
  ])("rejects incompatible output %#", (value) => expect(() => validate(value)).toThrow());
  it("requires advertised probabilities even without request requirement", () => {
    expect(() =>
      validateResult(
        request,
        { answers: { ...answers, urgent: { kind: "boolean", predictedValue: true } } },
        { adapter: "test", model: "test" },
        {
          ...capabilities,
          kinds: { ...capabilities.kinds, boolean: { probabilities: true, confidence: false } },
        },
      ),
    ).toThrow();
  });
  it("rejects incompatible requirements before execution", () => {
    expect(() =>
      prepare({ ...request, requirements: { probabilities: "required" } }, capabilities),
    ).toThrow();
    expect(() => prepare(request, { ...capabilities, kinds: {} })).toThrow();
    expect(() => prepare({ ...request, state: {} }, { ...capabilities, state: "text" })).toThrow();
  });
  it("does not fabricate distributions for labels", () => {
    const result = validate({
      urgent: { kind: "boolean", predictedValue: true },
      team: { kind: "choice", value: "tech" },
      mood: { kind: "ordinal", selectedIndex: 1 },
    });
    expect(result.answers.urgent.probabilityTrue).toBeUndefined();
    expect(result.answers.team.probabilities).toBeUndefined();
  });
  it("validates token usage and metadata", () => {
    for (const extra of [
      { usage: { inputTokens: -1 } },
      { resolvedModel: "" },
      { usage: { inputTokens: 0.1 } },
    ]) {
      expect(() =>
        validateResult(
          request,
          { answers, ...extra },
          { adapter: "test", model: "test" },
          capabilities,
        ),
      ).toThrow();
    }
  });
  it("computes derived expectation explicitly", () => expect(expectedIndex([0.2, 0.8])).toBe(0.8));
});
