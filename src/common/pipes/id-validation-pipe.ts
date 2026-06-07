import { C400Exception } from "@common/exceptions";
import { ResponseCode } from "@common/exceptions/response-code";
import { type ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable({})
export class IdValidationPipe implements PipeTransform {
  transform(value: any, _metadata: ArgumentMetadata) {
    if (!UUID_REGEX.test(value)) {
      throw new C400Exception(ResponseCode.IdValidationError);
    }
    return value;
  }
}
