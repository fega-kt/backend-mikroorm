import { getRequestInfo } from "@common/request-context";
import { type LoggerService } from "@nestjs/common";

// Wraps the app logger so every Logger call made inside a request is prefixed with its request id
export class RequestIdLogger implements LoggerService {
  constructor(private readonly inner: LoggerService) {}

  log(message: unknown, ...rest: unknown[]) {
    this.inner.log(this.withRequestId(message), ...rest);
  }

  error(message: unknown, ...rest: unknown[]) {
    this.inner.error(this.withRequestId(message), ...rest);
  }

  warn(message: unknown, ...rest: unknown[]) {
    this.inner.warn(this.withRequestId(message), ...rest);
  }

  debug(message: unknown, ...rest: unknown[]) {
    this.inner.debug?.(this.withRequestId(message), ...rest);
  }

  verbose(message: unknown, ...rest: unknown[]) {
    this.inner.verbose?.(this.withRequestId(message), ...rest);
  }

  fatal(message: unknown, ...rest: unknown[]) {
    this.inner.fatal?.(this.withRequestId(message), ...rest);
  }

  private withRequestId(message: unknown): unknown {
    const requestId = getRequestInfo()?.requestId;
    return requestId && typeof message === "string" ? `[${requestId}] ${message}` : message;
  }
}
