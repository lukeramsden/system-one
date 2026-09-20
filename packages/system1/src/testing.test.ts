import { describe, expect, it } from "vite-plus/test";
import { Effect } from "effect";
import { createClient, defineQuestions, Question, System1Error } from "./index.js";
import { System1, layer } from "./effect.js";
import { stubModel } from "./testing.js";

const questions = defineQuestions({
  urgent: Question.boolean({ instructions: "Urgent?" }),
  dept: Question.choice({ instructions: "Dept?", options: { a: "A", b: "B" } }),
});

const answers = {
  urgent: { kind: "boolean", probabilityTrue: 0.9 },
  dept: { kind: "choice", value: "a", probabilities: { a: 0.7, b: 0.3 } },
} as const;

describe("stubModel", () => {
  it("is typed against the question set when questions are supplied", () => {
    stubModel({ questions, answers });
    // @ts-expect-error unknown key
    stubModel({
      questions,
      answers: { ...answers, extra: { kind: "boolean", probabilityTrue: 1 } },
    });
    // @ts-expect-error missing key
    stubModel({ questions, answers: { urgent: answers.urgent } });
    // @ts-expect-error undeclared choice value
    stubModel({ questions, answers: { ...answers, dept: { kind: "choice", value: "zzz" } } });
    // @ts-expect-error wrong kind for this key
    stubModel({
      questions,
      answers: { ...answers, urgent: { kind: "ordinal", selectedIndex: 0 } },
    });
    stubModel({
      questions,
      respond: (request) => {
        const state: unknown = request.state;
        void state;
        return {
          ...answers,
          dept: { kind: "choice", value: "b", probabilities: { a: 0.3, b: 0.7 } },
        };
      },
    });
    expect(true).toBe(true);
  });

  it("serves the Promise client without HTTP and records calls", async () => {
    const stub = stubModel({ answers, resolvedModel: "stub-1.0", usage: { inputTokens: 3 } });
    const client = createClient({
      model: stub,
      fetch: () => Promise.reject(new Error("must not fetch")),
    });
    const result = await client.evaluate({ state: { text: "hi" }, questions });
    expect(result.answers.dept.value).toBe("a");
    expect(result.model).toEqual({
      adapter: "stub",
      requestedModel: "stub-1",
      resolvedModel: "stub-1.0",
    });
    expect(result.usage).toEqual({ inputTokens: 3 });
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.state).toEqual({ text: "hi" });
    stub.reset();
    expect(stub.calls).toHaveLength(0);
  });

  it("serves the Effect layer with no HttpClient requirement", async () => {
    const stub = stubModel({
      respond: (request) =>
        request.state === "b"
          ? { ...answers, dept: { kind: "choice", value: "b", probabilities: { a: 0.3, b: 0.7 } } }
          : answers,
    });
    const program = Effect.gen(function* () {
      const s = yield* System1;
      return yield* s.evaluate({ state: "b", questions });
    });
    const result = await Effect.runPromise(program.pipe(Effect.provide(layer(stub))));
    expect(result.answers.dept.value).toBe("b");
  });

  it("still validates: an invalid shape is InvalidResponse, not a typed lie", async () => {
    const stub = stubModel({ answers: { ...answers, dept: { kind: "choice", value: "zzz" } } });
    await expect(
      createClient({ model: stub }).evaluate({ state: "x", questions }),
    ).rejects.toMatchObject({ _tag: "InvalidResponse" });
  });

  it("honours narrowed capabilities before evaluating", async () => {
    const stub = stubModel({
      answers,
      capabilities: {
        kinds: {
          boolean: { probabilities: false, confidence: false },
          choice: { probabilities: false, confidence: false },
        },
        state: "json",
        descriptions: "json",
      },
    });
    await expect(
      createClient({ model: stub }).evaluate({
        state: "x",
        questions,
        requirements: { probabilities: "required" },
      }),
    ).rejects.toMatchObject({ _tag: "UnsupportedCapability" });
    expect(stub.calls).toHaveLength(0);
  });

  it("propagates a thrown System1Error as a failure in both runtimes", async () => {
    const stub = stubModel({
      respond: () => {
        throw new System1Error("RateLimited", "Rate limited", { retryAfterMs: 10 });
      },
    });
    await expect(
      createClient({ model: stub }).evaluate({ state: "x", questions }),
    ).rejects.toMatchObject({ _tag: "RateLimited" });
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        return yield* (yield* System1).evaluate({ state: "x", questions });
      }).pipe(Effect.provide(layer(stub))),
    );
    expect(exit._tag).toBe("Failure");
  });
});
