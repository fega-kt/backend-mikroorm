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
    response.status(status).json({
      message,
    });
  }
}
