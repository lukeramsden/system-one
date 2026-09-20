import { bearer, checkHttp, defineAdapter, endpoint } from "../adapter.js";
import { record } from "../core.js";
import { System1Error } from "../errors.js";
import { decodeTyped, encodeQuestions, typedCapabilities } from "./typed-decisions.js";

export interface CloudflareOptions {
  readonly accountId: string;
  readonly apiToken: string;
  readonly gatewayId?: string;
  readonly model?: "typesafe/jev";
}
/** The gateway envelope supports many models; this adapter only claims Jev semantics. */
export function cloudflare(options: CloudflareOptions) {
  if (!/^[a-f\d]{32}$/i.test(options.accountId))
    throw new System1Error(
      "InvalidRequest",
      "Cloudflare accountId must be 32 hexadecimal characters",
    );
  if (options.gatewayId !== undefined && !/^[a-zA-Z0-9_-]+$/.test(options.gatewayId))
    throw new System1Error("InvalidRequest", "Invalid gateway identifier");
  const url = endpoint(`https://api.cloudflare.com/client/v4/accounts/${options.accountId}/ai/run`);
  const authorization = bearer(options.apiToken);
  const model = options.model ?? "typesafe/jev";
  if (model !== "typesafe/jev")
    throw new System1Error(
      "UnsupportedCapability",
      "Cloudflare adapter currently supports typesafe/jev only",
    );
  const headers = {
    authorization,
    "content-type": "application/json",
    ...(options.gatewayId ? { "cf-aig-gateway-id": options.gatewayId } : {}),
  };
  return defineAdapter({
    id: "cloudflare",
    model,
    capabilities: typedCapabilities,
    encode: (request) => ({
      url,
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        input: { state: request.state, questions: encodeQuestions(request) },
      }),
    }),
    decode: (response, request) => {
      const body = response.body;
      if (body !== null && typeof body === "object" && !Array.isArray(body)) {
        const envelope = record(body);
        if (envelope.success === false) {
          const errors = Array.isArray(envelope.errors) ? envelope.errors : [];
          const codes = errors.map((e) =>
            e && typeof e === "object" ? String((e as Record<string, unknown>).code) : "",
          );
          if (codes.includes("2021"))
            throw new System1Error(
              "QuotaExceeded",
              "Cloudflare requires credits or provider credentials",
              { providerCode: "2021", status: response.status },
            );
          if (codes.includes("10000"))
            throw new System1Error(
              "AuthenticationError",
              "Cloudflare authentication or permissions failed",
              { providerCode: "10000", status: response.status },
            );
          checkHttp(response);
          throw new System1Error(
            "ProviderError",
            "Cloudflare reported an unsuccessful evaluation",
            { status: response.status },
          );
        }
      }
      checkHttp(response);
      const envelope = record(body);
      // Cloudflare documents model-native output and also uses API result envelopes.
      const payload = Object.hasOwn(envelope, "result")
        ? envelope.success === true
          ? envelope.result
          : undefined
        : envelope;
      const decoded = decodeTyped(payload, request, "typesafe:distribution-confidence");
      const requestId = response.headers["cf-aig-log-id"] ?? response.headers["cf-ray"];
      return { ...decoded, ...(requestId ? { requestId } : {}) };
    },
  });
}
