import { IUserResponse } from "@common/base/consts";

declare global {
  namespace Express {
    interface Request {
      user?: IUserResponse;
      isPublic?: boolean;
    }
  }
}
