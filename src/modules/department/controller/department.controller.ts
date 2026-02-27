import { ZodValidationPipe } from "@common/pipes/zod-validation-pipe";
import { JwtAuthGuard } from "@modules/auth/guards/jwt-auth.guard";
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import z from "zod";
import { DepartmentEntity } from "../entity/department.entity";
import { DepartmentService } from "../service/department.service";
import { createDepartmentValidation } from "../validation/department.validation";

@Controller("department")
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Body(new ZodValidationPipe(createDepartmentValidation))
    data: z.infer<typeof createDepartmentValidation>
  ): Promise<DepartmentEntity> {
    return this.departmentService.create(data);
  }
}
