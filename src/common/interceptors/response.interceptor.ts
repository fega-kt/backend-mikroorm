import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, Observable } from "rxjs";

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, { result: T }> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<{ result: T }> {
    return next.handle().pipe(
      map((data) => ({
        result: data,
      })),
    );
  }
}
