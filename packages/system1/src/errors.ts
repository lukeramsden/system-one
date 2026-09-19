export type ErrorTag =
  | "InvalidRequest"
  | "UnsupportedCapability"
  | "AuthenticationError"
  | "QuotaExceeded"
  | "RateLimited"
  | "ContextLimitExceeded"
  | "TransportError"
  | "InvalidResponse"
  | "ProviderError";

export interface ErrorDetails {
  readonly status?: number;
  readonly providerCode?: string;
  readonly requestId?: string;
  readonly retryAfterMs?: number;
}

/** Messages and details must never contain credentials or request/response bodies. */
export class System1Error extends Error {
  readonly name = "System1Error";
  constructor(
    readonly _tag: ErrorTag,
    message: string,
    readonly details: ErrorDetails = {},
  ) {
    super(message);
  }
}

export function isSystem1Error(value: unknown): value is System1Error {
  return value instanceof System1Error;
}

export function fail(tag: ErrorTag, message: string): never {
  throw new System1Error(tag, message);
}
