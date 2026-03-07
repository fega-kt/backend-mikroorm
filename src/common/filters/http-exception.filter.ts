import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import chalk from "chalk";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private logger = new Logger("HTTP");

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    const status = exception instanceof HttpException ? exception.getStatus() : 500;

    const message = exception instanceof HttpException ? exception.message : "Internal server error";

    if (status >= 500) {
      this.logger.error(chalk.red(message));
      this.logger.error(chalk.red(exception.stack));
    } else if (status >= 400) {
      this.logger.warn(chalk.yellow(message));
      this.logger.error(chalk.red(exception.stack));
    }
    response.status(status).json({
      message,
    });
  }
}
