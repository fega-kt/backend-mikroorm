import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from "@nestjs/common";
import { Request, Response } from "express";
import { Observable, throwError } from "rxjs";
import { catchError, tap } from "rxjs/operators";
import { MetricsService } from "@modules/metrics/metrics.service";

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.record(req, String(res.statusCode), start);
      }),
      catchError((err: unknown) => {
        const statusCode = err instanceof HttpException ? err.getStatus() : 500;
        this.record(req, String(statusCode), start);
        return throwError(() => err);
      }),
    );
  }

  private record(req: Request, statusCode: string, start: number) {
    const route: string = (req.route as { path?: string } | undefined)?.path ?? req.path;
    const method = req.method;
    const duration = (Date.now() - start) / 1000;

    this.metricsService.httpRequestsTotal.inc({ method, route, status_code: statusCode });
    this.metricsService.httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
  }
}
