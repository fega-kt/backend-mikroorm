import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private logger = new Logger("HTTP");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    const status = exception instanceof HttpException ? exception.getStatus() : 500;

    const message = exception instanceof HttpException ? exception.message : "Internal server error";

    if (status >= 500) {
      this.logger.error(message);
      this.logger.error((exception as Error).stack);
    } else if (status >= 400) {
      this.logger.warn(message);
      this.logger.error((exception as Error).stack);
    }
    // Lỗi nghiệp vụ có mã riêng (vd INVALID_PIN kèm remainingAttempts): trả kèm để client xử lý theo mã, không theo câu chữ
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const coded = body && typeof body === "object" && "code" in body ? (body as Record<string, unknown>) : undefined;
    response.status(status).json({
      ...(coded ? { ...coded, statusCode: undefined, error: undefined } : {}),
      message,
    });
  }
}
