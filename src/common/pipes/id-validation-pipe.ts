import { C400Exception } from "@common/exceptions";
import { ResponseCode } from "@common/exceptions/response-code";
import { ObjectId } from "@mikro-orm/mongodb";
import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common";

@Injectable({})
export class IdValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    try {
      if (new ObjectId(value).toString() !== value) {
        throw new C400Exception(ResponseCode.IdValidationError);
      }
      return value;
    } catch {
      throw new C400Exception(ResponseCode.IdValidationError);
    }
  }
}
