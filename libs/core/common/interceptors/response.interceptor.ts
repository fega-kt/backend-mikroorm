import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, Observable } from "rxjs";

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, { result: T; time: number }> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<{ result: T; time: number }> {
    const start = Date.now();
    return next.handle().pipe(
      map((data) => ({
        result: data,
        time: Date.now() - start,
      })),
    );
  }
}
