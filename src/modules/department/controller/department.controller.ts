import { ZodValidationPipe } from "@common/pipes/zod-validation-pipe";
import { Body, Controller, Post } from "@nestjs/common";
import z from "zod";
import { DepartmentEntity } from "../entity/department.entity";
import { DepartmentService } from "../service/department.service";
import { createDepartmentValidation } from "../validation/department.validation";

@Controller("department")
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createDepartmentValidation))
    data: z.infer<typeof createDepartmentValidation>
  ): Promise<DepartmentEntity> {
    return this.departmentService.create(data);
  }
}
