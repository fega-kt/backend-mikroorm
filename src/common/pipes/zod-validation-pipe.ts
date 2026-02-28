import { HttpException, HttpStatus, Injectable, PipeTransform, Scope } from '@nestjs/common';
import { ZodTypeAny } from 'zod';

@Injectable({ scope: Scope.REQUEST })
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }
    console.log(result.error);
    throw new HttpException(
      {
        data: result.error.issues,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
