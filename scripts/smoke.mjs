// Packs system-one and exercises it from a fresh consumer: first without Effect, then with it.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkg = join(root, "packages/system1");
const work = mkdtempSync(join(tmpdir(), "system1-smoke-"));
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, npm_config_ignore_scripts: "true" },
  });

try {
  run("pnpm", ["pack", "--pack-destination", work], pkg);
  const tarball = join(
    work,
    readdirSync(work).find((f) => f.endsWith(".tgz")),
  );
  const consumer = join(work, "consumer");
  run("mkdir", ["-p", consumer]);
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "consumer", private: true, type: "module" }),
  );
  run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", tarball], consumer);

  writeFileSync(
    join(consumer, "without-effect.mjs"),
    `
import { createClient, Question, defineQuestions, System1Error } from "system-one";
import { snapshot } from "system-one/core";
import { defineAdapter, checkHttp } from "system-one/adapter";
import { jev } from "system-one/adapters/typesafe";
import { cloudflare } from "system-one/adapters/cloudflare";
import { laya } from "system-one/adapters/laya";
import { stubModel } from "system-one/testing";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let effectPresent = true;
try { require.resolve("effect"); } catch { effectPresent = false; }
if (effectPresent) throw new Error("effect must not be installed in this phase");
const questions = defineQuestions({ ok: Question.boolean({ instructions: "Is it ok?" }) });
const fixture = defineAdapter({ id: "fixture", model: "fixture", capabilities: { kinds: { boolean: { probabilities: true, confidence: false } }, state: "json", descriptions: "json" },
  encode: () => ({ url: "https://example.invalid", method: "POST", headers: {}, body: "{}" }),
  decode: (response) => { checkHttp(response); return { answers: { ok: { kind: "boolean", probabilityTrue: 0.75 } } }; } });
const client = createClient({ model: fixture, fetch: async () => Response.json({}) });
const result = await client.evaluate({ state: snapshot({ text: "hello" }), questions });
if (result.answers.ok.probabilityTrue !== 0.75) throw new Error("unexpected answer");
const stub = stubModel({ answers: { ok: { kind: "boolean", probabilityTrue: 0.5 } } });
const stubbed = await createClient({ model: stub }).evaluate({ state: "x", questions });
if (stubbed.answers.ok.probabilityTrue !== 0.5 || stub.calls.length !== 1) throw new Error("stub failed");
for (const make of [() => jev({ apiKey: "k" }), () => cloudflare({ accountId: "a".repeat(32), apiToken: "t" }), () => laya({ endpoint: "http://localhost:1/x", model: "m" })]) make();
if (!(new System1Error("ProviderError", "x") instanceof Error)) throw new Error("bad error class");
console.log("smoke: promise API ok without effect");
`,
  );
  run("node", ["without-effect.mjs"], consumer);

  run(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      "--loglevel=error",
      "effect@3.22.2",
      "@effect/platform@0.97.2",
    ],
    consumer,
  );
  writeFileSync(
    join(consumer, "with-effect.mjs"),
    `
import { Effect } from "effect";
import { System1, testLayer } from "system-one/effect";
import { Question } from "system-one";
const questions = { ok: Question.boolean({ instructions: "Is it ok?" }) };
const layer = testLayer({ capabilities: { kinds: { boolean: { probabilities: true, confidence: false } }, state: "json", descriptions: "json" }, evaluate: () => ({ answers: { ok: { kind: "boolean", probabilityTrue: 0.25 } } }) });
const program = Effect.gen(function* () { return yield* (yield* System1).evaluate({ state: "s", questions }); });
const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
if (result.answers.ok.probabilityTrue !== 0.25) throw new Error("unexpected answer");
console.log("smoke: effect API ok");
`,
  );
  run("node", ["with-effect.mjs"], consumer);
} finally {
  rmSync(work, { recursive: true, force: true });
}
