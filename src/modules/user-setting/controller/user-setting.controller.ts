import { Controller } from "@nestjs/common";

import { UserSettingService } from "../service/user-setting.service";

@Controller("user-setting")
export class UserSettingController {
  constructor(private readonly userSettingService: UserSettingService) {}
}
