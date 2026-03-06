import { Controller } from "@nestjs/common";
import { GroupService } from "../service/department.service";

@Controller("group")
export class GroupController {
  constructor(private readonly groupService: GroupService) {}
}
