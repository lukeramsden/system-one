import type { Capabilities, DecodedEvaluation, EvaluationRequest } from "./core.js";
import { System1Error } from "./errors.js";
export type { Capabilities, DecodedEvaluation, EvaluationRequest } from "./core.js";
export { record } from "./core.js";
export { System1Error } from "./errors.js";

export interface PreparedRequest {
  readonly url: string;
  readonly method: "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}
export interface ReceivedResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}
/** Trusted adapter code may throw System1Error; unexpected exceptions remain defects. */
export interface ModelProtocol {
  readonly id: string;
  readonly model: string;
  readonly capabilities: Capabilities;
  encode(request: EvaluationRequest): PreparedRequest;
  decode(response: ReceivedResponse, request: EvaluationRequest): DecodedEvaluation;
}
/**
 * A model answered in-process (stubs, fixtures, embedded models). No HTTP is involved,
 * but the same request preparation and result validation run as for ModelProtocol.
 */
export interface LocalModel {
  readonly id: string;
  readonly model: string;
  readonly capabilities: Capabilities;
  evaluate(request: EvaluationRequest): DecodedEvaluation | Promise<DecodedEvaluation>;
}
/** Anything a runtime can evaluate against. */
export type Model = ModelProtocol | LocalModel;
export function isLocalModel(model: Model): model is LocalModel {
  return typeof (model as LocalModel).evaluate === "function";
}
export function defineAdapter(protocol: ModelProtocol): ModelProtocol {
  if (!protocol.id.trim() || !protocol.model.trim())
    throw new System1Error("InvalidRequest", "Adapter and model identifiers are required");
  return Object.freeze(protocol);
}

/** Sanitized generic HTTP classification. Adapters may classify documented provider codes first. */
export function checkHttp(response: ReceivedResponse): void {
  const { status, headers } = response;
  if (status >= 200 && status < 300) return;
  const retry = headers["retry-after"];
  const seconds = retry === undefined ? NaN : Number(retry);
  const delay =
    retry === undefined
      ? NaN
      : Number.isFinite(seconds)
        ? seconds * 1000
        : Date.parse(retry) - Date.now();
  const details = {
    status,
    ...(Number.isFinite(delay) ? { retryAfterMs: Math.max(0, delay) } : {}),
  };
  const tag =
    status === 401 || status === 403
      ? "AuthenticationError"
      : status === 402
        ? "QuotaExceeded"
        : status === 429 || status === 529
          ? "RateLimited"
          : status === 413
            ? "ContextLimitExceeded"
            : status === 400 || status === 422
              ? "InvalidRequest"
              : "ProviderError";
  throw new System1Error(tag, `Provider returned HTTP ${status}`, details);
}

/** Reject accidental credential forwarding through redirects and non-HTTP URLs. */
export function endpoint(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new System1Error("InvalidRequest", "Invalid endpoint URL");
  }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.hash)
    throw new System1Error(
      "InvalidRequest",
      "Endpoint must be an HTTP URL without embedded credentials or fragment",
    );
  if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new System1Error("InvalidRequest", "Use HTTPS except for loopback development servers");
  return url.toString();
}

export function bearer(value: string): string {
  if (!value.trim() || /[\r\n]/.test(value))
    throw new System1Error("AuthenticationError", "A valid API credential is required");
  return `Bearer ${value}`;
}
