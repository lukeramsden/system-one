import { Context, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "@effect/platform";
import { prepare, validateResult } from "./core.js";
import type {
  EvaluationRequest,
  EvaluationResult,
  Questions,
  Requirements,
  DecodedEvaluation,
  Capabilities,
} from "./core.js";
import { isLocalModel } from "./adapter.js";
import type { LocalModel, Model, ModelProtocol } from "./adapter.js";
import { isSystem1Error, System1Error } from "./errors.js";

export interface System1Service {
  readonly evaluate: <const Q extends Questions, const R extends Requirements = {}>(
    request: EvaluationRequest<Q, R>,
  ) => Effect.Effect<EvaluationResult<Q, R>, System1Error>;
}
export class System1 extends Context.Tag("system-one/System1")<System1, System1Service>() {}

/** Only documented operational failures enter the error channel. Bugs remain defects. */
function attempt<A>(thunk: () => A): Effect.Effect<A, System1Error> {
  return Effect.suspend(() => {
    try {
      return Effect.succeed(thunk());
    } catch (error) {
      return isSystem1Error(error) ? Effect.fail(error) : Effect.die(error);
    }
  });
}

function localService(model: LocalModel): System1Service {
  return System1.of({
    evaluate: (request) =>
      Effect.gen(function* () {
        const prepared = yield* attempt(() => prepare(request, model.capabilities));
        const decoded = yield* Effect.suspend(() => {
          try {
            const out = model.evaluate(prepared);
            return out instanceof Promise
              ? Effect.tryPromise({
                  try: () => out,
                  catch: (error) => error,
                }).pipe(
                  Effect.catchAll((error) =>
                    isSystem1Error(error) ? Effect.fail(error) : Effect.die(error),
                  ),
                )
              : Effect.succeed(out);
          } catch (error) {
            return isSystem1Error(error) ? Effect.fail(error) : Effect.die(error);
          }
        });
        return yield* attempt(() =>
          validateResult(
            prepared,
            decoded,
            { adapter: model.id, model: model.model },
            model.capabilities,
          ),
        );
      }).pipe(
        Effect.withSpan("system1.evaluate", {
          attributes: { "system1.adapter": model.id, "system1.model": model.model },
        }),
      ),
  });
}

/**
 * Supply a model. HTTP protocols need an injectable Effect HttpClient; local models
 * (stubs from `system-one/testing`, embedded models) need nothing.
 */
export function layer(model: LocalModel): Layer.Layer<System1>;
export function layer(model: ModelProtocol): Layer.Layer<System1, never, HttpClient.HttpClient>;
export function layer(model: Model): Layer.Layer<System1, never, HttpClient.HttpClient> {
  if (isLocalModel(model)) return Layer.succeed(System1, localService(model));
  return protocolLayer(model);
}

function protocolLayer(model: ModelProtocol): Layer.Layer<System1, never, HttpClient.HttpClient> {
  return Layer.effect(
    System1,
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      return System1.of({
        evaluate: (request) =>
          Effect.gen(function* () {
            const prepared = yield* attempt(() => prepare(request, model.capabilities));
            const encoded = yield* attempt(() => model.encode(prepared));
            const outgoing = HttpClientRequest.post(encoded.url, { headers: encoded.headers }).pipe(
              HttpClientRequest.bodyText(encoded.body, "application/json"),
            );
            const response = yield* http
              .execute(outgoing)
              .pipe(
                Effect.mapError(() => new System1Error("TransportError", "HTTP transport failed")),
              );
            const text = yield* response.text.pipe(
              Effect.mapError(
                () => new System1Error("TransportError", "Response transport failed"),
              ),
            );
            let body: unknown;
            try {
              body = JSON.parse(text);
            } catch {
              body = null;
            }
            const decoded = yield* attempt(() =>
              model.decode({ status: response.status, headers: response.headers, body }, prepared),
            );
            return yield* attempt(() =>
              validateResult(
                prepared,
                decoded,
                { adapter: model.id, model: model.model },
                model.capabilities,
              ),
            );
          }).pipe(
            Effect.withSpan("system1.evaluate", {
              attributes: { "system1.adapter": model.id, "system1.model": model.model },
            }),
          ),
      });
    }),
  );
}

/** @deprecated Use `layer(stubModel({ ... }))` from `system-one/testing`. */
export function testLayer(options: {
  readonly capabilities: Capabilities;
  readonly evaluate: (request: EvaluationRequest) => DecodedEvaluation;
}): Layer.Layer<System1> {
  return layer({
    id: "test",
    model: "fixture",
    capabilities: options.capabilities,
    evaluate: options.evaluate,
  });
}
