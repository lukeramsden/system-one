import { bearer, checkHttp, defineAdapter, endpoint } from "../adapter.js";
import { decodeTyped, encodeQuestions, typedCapabilities } from "./typed-decisions.js";

export interface LayaOptions {
  /** Full URL of your explicitly compatible bridge, not a Hugging Face inference URL. */
  readonly endpoint: string;
  readonly model: string;
  readonly apiKey?: string;
}
/** Opt-in system1 Laya bridge v1 contract. No public hosted Laya API is assumed. */
export function laya(options: LayaOptions) {
  const url = endpoint(options.endpoint);
  const headers = {
    "content-type": "application/json",
    ...(options.apiKey ? { authorization: bearer(options.apiKey) } : {}),
  };
  const model = options.model;
  return defineAdapter({
    id: "laya-bridge-v1",
    model,
    capabilities: typedCapabilities,
    encode: (request) => ({
      url,
      method: "POST",
      headers,
      body: JSON.stringify({
        protocol: "system1-laya-v1",
        model,
        state: request.state,
        questions: encodeQuestions(request),
      }),
    }),
    decode: (response, request) => {
      checkHttp(response);
      return decodeTyped(response.body, request, "laya:reported-confidence");
    },
  });
}
