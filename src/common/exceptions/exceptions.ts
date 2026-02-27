import { HttpException, HttpStatus } from "@nestjs/common";
import { ResponseCode } from "./response-code";

export type ExceptionRef = unknown;

export class ExceptionBase extends HttpException {
  public constructor(
    httpStatus: HttpStatus,
    private readonly errorCode: ResponseCode,
    private readonly ref?: ExceptionRef
  ) {
    super("", httpStatus);
  }

  public getCode(): ResponseCode {
    return this.errorCode;
  }

  public getRef(): ExceptionRef {
    return this.ref;
  }
}

export class C400Exception extends ExceptionBase {
  public constructor(errorCode: ResponseCode, ref?: ExceptionRef) {
    super(HttpStatus.BAD_REQUEST, errorCode, ref);
  }
}

export class C401Exception extends ExceptionBase {
  public constructor(errorCode: ResponseCode, ref?: ExceptionRef) {
    super(HttpStatus.UNAUTHORIZED, errorCode, ref);
  }
}

export class C500Exception extends ExceptionBase {
  public constructor(errorCode: ResponseCode, ref?: ExceptionRef) {
    super(HttpStatus.INTERNAL_SERVER_ERROR, errorCode, ref);
  }
}

export class C403Exception extends ExceptionBase {
  public constructor(errorCode: ResponseCode, ref?: ExceptionRef) {
    super(HttpStatus.FORBIDDEN, errorCode, ref);
  }
}

/* eslint-enable max-classes-per-file -- Bật lại */
