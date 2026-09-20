// Compiled by `pnpm typecheck`. Every snippet in docs/*.md is mirrored here so it cannot drift.
import { Question, defineQuestions, createClient, expectedIndex, System1Error } from "system1";
import type { EvaluationResult } from "system1";
import { defineAdapter, checkHttp, endpoint, bearer, record } from "system1/adapter";
import type { ModelProtocol, PreparedRequest, ReceivedResponse } from "system1/adapter";
import type { EvaluationRequest, DecodedEvaluation, Capabilities } from "system1/core";

// --- semantics.md: question kinds ---
export const triage = defineQuestions({
  urgent: Question.boolean({
    instructions: "Does this need urgent attention?",
    criteria: { true: "Time-sensitive", false: "Routine" },
  }),
  department: Question.choice({
    instructions: "Which department?",
    options: { billing: "Money", technical: "Bugs", sales: "Pricing" },
  }),
  frustration: Question.ordinal({
    instructions: "How frustrated?",
    levels: ["Calm", "Frustrated", "Very angry"],
  }),
});

// --- semantics.md: thresholds are yours ---
export function decide(
  result: EvaluationResult<typeof triage>,
  escalate: () => void,
): "billing" | "technical" | "sales" {
  const p = result.answers.urgent.probabilityTrue;
  if (p !== undefined && p >= 0.9) escalate();
  return result.answers.department.value;
}
export const derived: number = expectedIndex([0.05, 0.8, 0.15]);

// --- writing-an-adapter.md ---
const capabilities: Capabilities = {
  kinds: {
    boolean: { probabilities: true, confidence: false },
    choice: { probabilities: true, confidence: true },
  },
  state: "text-or-structured",
  descriptions: "json",
};
const url = endpoint("https://example.com/v1/evaluate");
const authorization = bearer("replace-me");
const model = "example-1";

function toWire(request: EvaluationRequest): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(request.questions).map(([key, q]) => [
      key,
      { kind: q.kind, instructions: q.instructions },
    ]),
  );
}
function encode(request: EvaluationRequest): PreparedRequest {
  return {
    url,
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ model, state: request.state, questions: toWire(request) }),
  };
}
function classifyProviderErrors(response: ReceivedResponse): void {
  const body = response.body;
  if (body && typeof body === "object" && (body as { success?: unknown }).success === false) {
    const codes = ((body as { errors?: { code?: unknown }[] }).errors ?? []).map((e) =>
      String(e.code),
    );
    if (codes.includes("2021"))
      throw new System1Error("QuotaExceeded", "Provider requires credits", {
        providerCode: "2021",
      });
  }
}
function normalise(
  answers: Record<string, unknown>,
  request: EvaluationRequest,
): Record<string, unknown> {
  return Object.fromEntries(Object.keys(request.questions).map((key) => [key, answers[key]]));
}
function decode(response: ReceivedResponse, request: EvaluationRequest): DecodedEvaluation {
  classifyProviderErrors(response);
  checkHttp(response);
  const body = record(response.body);
  return {
    answers: normalise(record(body.answers), request),
    ...(typeof body.model === "string" ? { resolvedModel: body.model } : {}),
  };
}
export const exampleAdapter: ModelProtocol = defineAdapter({
  id: "example",
  model,
  capabilities,
  encode,
  decode,
});

// --- README: requirements literal tightens the type ---
export async function required(): Promise<number> {
  const client = createClient({ model: exampleAdapter });
  const result = await client.evaluate({
    state: "hi",
    questions: { urgent: triage.urgent },
    requirements: { probabilities: "required" },
  });
  return result.answers.urgent.probabilityTrue; // number, not number | undefined
}
