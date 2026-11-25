import type { ApiErrorBody } from "@dnsit/shared";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class ProviderError extends Error {
  constructor(
    readonly code:
      | "AUTH_INVALID"
      | "RATE_LIMITED"
      | "NOT_FOUND"
      | "CONFLICT"
      | "QUOTA_EXCEEDED"
      | "INVALID_PARAM"
      | "NETWORK"
      | "UNKNOWN",
    message: string,
    readonly providerCode: string,
    readonly requestId?: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }

  toHttp(): HttpError {
    const map: Record<ProviderError["code"], number> = {
      AUTH_INVALID: 401,
      RATE_LIMITED: 429,
      NOT_FOUND: 404,
      CONFLICT: 409,
      QUOTA_EXCEEDED: 429,
      INVALID_PARAM: 422,
      NETWORK: 502,
      UNKNOWN: 502,
    };
    return new HttpError(map[this.code], this.code, this.message, {
      providerCode: this.providerCode,
      requestId: this.requestId,
      retryable: this.retryable,
    });
  }
}

export function toErrorBody(error: unknown): { status: number; body: { error: ApiErrorBody } } {
  if (error instanceof HttpError) {
    const details = (error.details ?? {}) as Record<string, unknown>;
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          providerCode: typeof details.providerCode === "string" ? details.providerCode : undefined,
          requestId: typeof details.requestId === "string" ? details.requestId : undefined,
          retryable: typeof details.retryable === "boolean" ? details.retryable : undefined,
          details: details.extra,
        },
      },
    };
  }
  if (error instanceof ProviderError) {
    const http = error.toHttp();
    return toErrorBody(http);
  }
  const message = error instanceof Error ? error.message : String(error);
  return { status: 500, body: { error: { code: "INTERNAL", message } } };
}
