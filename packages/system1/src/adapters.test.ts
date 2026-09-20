import { describe, expect, it, vi } from "vite-plus/test";
import { createClient } from "./client.js";
import { Question, defineQuestions } from "./core.js";
import { jev } from "./adapters/typesafe.js";
import { cloudflare } from "./adapters/cloudflare.js";
import { laya } from "./adapters/laya.js";
import { checkHttp } from "./adapter.js";

const questions = defineQuestions({
  urgent: Question.boolean({ instructions: "Urgent?" }),
  team: Question.choice({ instructions: "Team?", options: { billing: "Money", tech: "Bugs" } }),
  mood: Question.ordinal({ instructions: "Mood?", levels: ["Calm", "Angry"] }),
});
export const fixture = {
  model: "jev-1.13.0",
  answers: {
    urgent: { type: "noul", noul: 0.9 },
    team: {
      type: "choice",
      choice: "billing",
      probabilities: { billing: 0.7, tech: 0.3 },
      confidence: 0.4,
    },
    mood: {
      type: "score",
      score: 0.8,
      legend: { "0": "Calm", "1": "Angry" },
      probabilities: { "0": 0.2, "1": 0.8 },
      confidence: 0.6,
    },
  },
  usage: { input_tokens: 20, output_tokens: 10 },
};
const request = { state: "Hi", questions, requirements: { probabilities: "required" as const } };
const adapters = [
  jev({ apiKey: "SECRET" }),
  cloudflare({ accountId: "a".repeat(32), apiToken: "SECRET", gatewayId: "test" }),
  laya({ endpoint: "http://localhost:8000/evaluate", model: "laya" }),
];
describe.each(adapters)("adapter $id", (model) => {
  it("encodes and validates all primitives", async () => {
    let sent: unknown;
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      sent = JSON.parse(init?.body as string);
      return Response.json(
        model.id === "cloudflare" ? { success: true, result: fixture } : fixture,
      );
    });
    const result = await createClient({ model, fetch: fetcher as typeof fetch }).evaluate(request);
    expect(result.answers.team.value).toBe("billing");
    expect(result.answers.urgent.probabilityTrue).toBe(0.9);
    expect(result.answers.mood.expectedIndex).toBe(0.8);
    expect(result.model.resolvedModel).toBe("jev-1.13.0");
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
    const native = model.id === "cloudflare" ? (sent as { input: unknown }).input : sent;
    expect(native).toMatchObject({
      state: "Hi",
      questions: { urgent: { type: "noul" }, team: { type: "choice" }, mood: { type: "score" } },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed, non-JSON, and missing answers", async () => {
    for (const body of [
      null,
      {},
      { answers: {} },
      {
        ...fixture,
        answers: { ...fixture.answers, team: { ...fixture.answers.team, choice: "other" } },
      },
    ]) {
      await expect(
        createClient({ model, fetch: (async () => Response.json(body)) as typeof fetch }).evaluate(
          request,
        ),
      ).rejects.toMatchObject({ _tag: "InvalidResponse" });
    }
  });
  it("sanitizes transport errors", async () => {
    await expect(
      createClient({
        model,
        fetch: (async () => {
          throw Error("SECRET");
        }) as typeof fetch,
      }).evaluate(request),
    ).rejects.toMatchObject({ _tag: "TransportError", message: "HTTP transport failed" });
    expect(JSON.stringify(model)).not.toContain("SECRET");
  });
});
it.each([
  [401, "AuthenticationError"],
  [402, "QuotaExceeded"],
  [429, "RateLimited"],
  [529, "RateLimited"],
  [413, "ContextLimitExceeded"],
  [422, "InvalidRequest"],
  [503, "ProviderError"],
])("classifies HTTP %i", (status, tag) => {
  expect(() =>
    checkHttp({ status: status as number, headers: { "retry-after": "2" }, body: "SECRET" }),
  ).toThrow(
    expect.objectContaining({
      _tag: tag,
      details: expect.objectContaining({ retryAfterMs: 2000 }),
    }),
  );
});
it("classifies Cloudflare balance errors even on successful HTTP", async () => {
  const client = createClient({
    model: adapters[1]!,
    fetch: (async () =>
      Response.json({
        success: false,
        errors: [{ code: 2021, message: "secret" }],
      })) as typeof fetch,
  });
  await expect(client.evaluate(request)).rejects.toMatchObject({ _tag: "QuotaExceeded" });
});
it("cancels an in-flight Promise request", async () => {
  const controller = new AbortController();
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const fetcher: typeof fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
      started();
    });
  const pending = createClient({ model: adapters[0]!, fetch: fetcher }).evaluate(request, {
    signal: controller.signal,
  });
  await ready;
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});
it("rejects pre-aborted requests without sending HTTP", async () => {
  const fetcher = vi.fn();
  await expect(
    createClient({ model: adapters[0]!, fetch: fetcher }).evaluate(request, {
      signal: AbortSignal.abort(),
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("rejects unsafe endpoints", () => {
  expect(() => jev({ apiKey: "x", endpoint: "http://example.com" })).toThrow();
  expect(() => jev({ apiKey: "x", endpoint: "https://user:pass@example.com" })).toThrow();
});
