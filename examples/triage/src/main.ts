import { Effect } from "effect";
import { createClient } from "system-one";
import { System1, layer } from "system-one/effect";
import { fixtureModel } from "./fixture.ts";
import { ticket, triage } from "./questions.ts";

// Promise API
const client = createClient({ model: fixtureModel });
const viaPromise = await client.evaluate({
  state: ticket,
  questions: triage,
  requirements: { probabilities: "required" },
});

// Effect API — same definitions; a local model needs no HttpClient
const program = Effect.gen(function* () {
  const system1 = yield* System1;
  return yield* system1.evaluate({ state: ticket, questions: triage });
});
const viaEffect = await Effect.runPromise(program.pipe(Effect.provide(layer(fixtureModel))));

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
