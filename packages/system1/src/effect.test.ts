import { expect, it } from "vite-plus/test";
import { Effect, Exit, Fiber } from "effect";
import { FetchHttpClient } from "@effect/platform";
import { System1, layer, testLayer } from "./effect.js";
import { Question } from "./core.js";
import { jev } from "./adapters/typesafe.js";

const request = {
  state: "Hi",
  questions: { urgent: Question.boolean({ instructions: "Urgent?" }) },
};
const model = jev({ apiKey: "secret" });
const program = Effect.gen(function* () {
  return yield* (yield* System1).evaluate(request);
});
it("is lazy, uses injected HTTP, and validates answers", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json({ answers: { urgent: { type: "noul", noul: 0.9 } } });
  };
  const runnable = program.pipe(
    Effect.provide(layer(model)),
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, fetcher),
  );
  expect(calls).toBe(0);
  expect((await Effect.runPromise(runnable)).answers.urgent.probabilityTrue).toBe(0.9);
  expect(calls).toBe(1);
});
it("interrupts the underlying HTTP request", async () => {
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  let aborted = false;
  const fetcher: typeof fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => {
        aborted = true;
        reject(init!.signal!.reason);
      });
      started();
    });
  const fiber = Effect.runFork(
    program.pipe(
      Effect.provide(layer(model)),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetcher),
    ),
  );
  await ready;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(aborted).toBe(true);
});
it("keeps operational failures in the typed channel", async () => {
  const fixture = testLayer({
    capabilities: model.capabilities,
    evaluate: () => ({ answers: {} }),
  });
  const result = await Effect.runPromise(program.pipe(Effect.provide(fixture), Effect.flip));
  expect(result._tag).toBe("InvalidResponse");
});
it("does not turn adapter bugs into operational failures", async () => {
  const fixture = testLayer({
    capabilities: model.capabilities,
    evaluate: () => {
      throw Error("bug");
    },
  });
  expect(Exit.isFailure(await Effect.runPromiseExit(program.pipe(Effect.provide(fixture))))).toBe(
    true,
  );
});
