import { defineAdapter } from "system1/adapter";
import type { ModelProtocol } from "system1/adapter";

/** In-memory stand-in for a real model. Replace with jev(), cloudflare(), or laya(). */
export const fixtureModel: ModelProtocol = defineAdapter({
  id: "fixture",
  model: "fixture-1",
  capabilities: {
    kinds: {
      boolean: { probabilities: true, confidence: false },
      choice: { probabilities: true, confidence: true },
      ordinal: { probabilities: true, confidence: true },
    },
    state: "json",
    descriptions: "json",
  },
  encode: () => ({ url: "https://fixture.invalid/", method: "POST", headers: {}, body: "{}" }),
  decode: () => ({
    resolvedModel: "fixture-1.0.0",
    answers: {
      urgent: { kind: "boolean", probabilityTrue: 0.93 },
      department: {
        kind: "choice",
        value: "billing",
        probabilities: { billing: 0.86, technical: 0.12, sales: 0.02 },
        confidence: { value: 0.8, definition: "fixture:distribution-confidence" },
      },
      frustration: {
        kind: "ordinal",
        expectedIndex: 1.1,
        probabilities: [0.05, 0.8, 0.15],
        confidence: { value: 0.7, definition: "fixture:distribution-confidence" },
      },
    },
    usage: { inputTokens: 120, outputTokens: 18 },
  }),
});

/** A fetch that never reaches the network; the fixture ignores the response body. */
export const offlineFetch: typeof fetch = async () => Response.json({});
