import { stubModel, fullCapabilities } from "system-one/testing";

/** In-memory stand-in for a real model. Replace with jev(), cloudflare(), or laya(). */
export const fixtureModel = stubModel({
  id: "fixture",
  model: "fixture-1",
  resolvedModel: "fixture-1.0.0",
  usage: { inputTokens: 120, outputTokens: 18 },
  capabilities: fullCapabilities,
  answers: {
    urgent: {
      kind: "boolean",
      probabilityTrue: 0.93,
      confidence: { value: 0.9, definition: "fixture:distribution-confidence" },
    },
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
});
