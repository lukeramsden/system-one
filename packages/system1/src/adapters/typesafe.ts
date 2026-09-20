import { bearer, checkHttp, defineAdapter, endpoint } from "../adapter.js";
import { decodeTyped, encodeQuestions, typedCapabilities } from "./typed-decisions.js";

export interface JevOptions {
  readonly apiKey: string;
  readonly model?: string;
  /** Full native endpoint, for explicitly trusted compatible services. */
  readonly endpoint?: string;
}
export function jev(options: JevOptions) {
  const url = endpoint(options.endpoint ?? "https://api.typesafe.ai/v1/systemone");
  const authorization = bearer(options.apiKey);
  const model = options.model ?? "jev-latest";
  return defineAdapter({
    id: "typesafe",
    model,
    capabilities: typedCapabilities,
    encode: (request) => ({
      url,
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify({ model, state: request.state, questions: encodeQuestions(request) }),
    }),
    decode: (response, request) => {
      checkHttp(response);
      const result = decodeTyped(response.body, request, "typesafe:distribution-confidence");
      const requestId = response.headers["x-request-id"];
      return { ...result, ...(requestId ? { requestId } : {}) };
    },
  });
}
