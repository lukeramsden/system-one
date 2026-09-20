import { Effect } from "effect";
import { FetchHttpClient } from "@effect/platform";
import { createClient } from "system1";
import { System1, layer } from "system1/effect";
import { fixtureModel, offlineFetch } from "./fixture.ts";
import { ticket, triage } from "./questions.ts";

// Promise API
const client = createClient({ model: fixtureModel, fetch: offlineFetch });
const viaPromise = await client.evaluate({
  state: ticket,
  questions: triage,
  requirements: { probabilities: "required" },
});

// Effect API — same definitions, injected HTTP client
const program = Effect.gen(function* () {
  const system1 = yield* System1;
  return yield* system1.evaluate({ state: ticket, questions: triage });
});
const viaEffect = await Effect.runPromise(
  program.pipe(
    Effect.provide(layer(fixtureModel)),
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, offlineFetch),
  ),
);

for (const [label, result] of [
  ["promise", viaPromise],
  ["effect", viaEffect],
] as const) {
  const department: "billing" | "technical" | "sales" = result.answers.department.value;
  console.log(`[${label}] model=${result.model.resolvedModel ?? result.model.requestedModel}`);
  console.log(
    `[${label}] department=${department} p=${JSON.stringify(result.answers.department.probabilities)}`,
  );
  console.log(`[${label}] urgent p(true)=${result.answers.urgent.probabilityTrue}`);
  console.log(
    `[${label}] frustration expectedIndex=${result.answers.frustration.expectedIndex} (not a selected level)`,
  );
  // The application owns the threshold; the library never picks one.
  const escalate = (result.answers.urgent.probabilityTrue ?? 0) >= 0.9;
  console.log(`[${label}] escalate=${escalate}`);
}
