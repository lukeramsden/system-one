import { prepare, validateResult } from "./core.js";
import type { EvaluationRequest, EvaluationResult, Questions, Requirements } from "./core.js";
import type { ModelProtocol } from "./adapter.js";
import { System1Error } from "./errors.js";

export interface ExecutionOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}
export interface Client {
  evaluate<const Q extends Questions, const R extends Requirements = {}>(
    request: EvaluationRequest<Q, R>,
    options?: ExecutionOptions,
  ): Promise<EvaluationResult<Q, R>>;
}

/** One attempt per evaluation. No hidden retries, redirects, or model fallback. */
export function createClient(config: {
  readonly model: ModelProtocol;
  readonly fetch?: typeof globalThis.fetch;
}): Client {
  const transport = config.fetch ?? globalThis.fetch;
  const model = config.model;
  return {
    async evaluate(request, options = {}) {
      const prepared = prepare(request, model.capabilities);
      if (
        options.timeoutMs !== undefined &&
        (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0)
      )
        throw new System1Error("InvalidRequest", "timeoutMs must be a positive integer");
      const timeout =
        options.timeoutMs === undefined ? undefined : AbortSignal.timeout(options.timeoutMs);
      const signals = [options.signal, timeout].filter((s): s is AbortSignal => s !== undefined);
      const signal = signals.length ? AbortSignal.any(signals) : undefined;
      signal?.throwIfAborted();
      const encoded = model.encode(prepared);
      let response: Response;
      let text: string;
      try {
        response = await transport(encoded.url, {
          method: encoded.method,
          headers: encoded.headers,
          body: encoded.body,
          redirect: "error",
          ...(signal ? { signal } : {}),
        });
        text = await response.text();
      } catch {
        if (options.signal?.aborted) throw options.signal.reason;
        throw new System1Error(
          "TransportError",
          timeout?.aborted ? "Request timed out" : "HTTP transport failed",
        );
      }
      signal?.throwIfAborted();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      const decoded = model.decode(
        { status: response.status, headers: Object.fromEntries(response.headers), body },
        prepared,
      );
      return validateResult(
        prepared,
        decoded,
        { adapter: model.id, model: model.model },
        model.capabilities,
      );
    },
  };
}
