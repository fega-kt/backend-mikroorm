import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import z from "zod";
import { SectionService } from "../service/section.service";
import {
  createSectionValidation,
  reorderSectionsValidation,
  updateSectionValidation,
} from "../validation/section.validation";

@Controller("project/:projectId/sections")
export class SectionController {
  constructor(private readonly sectionService: SectionService) {}

  @Post()
  create(
    @Param("projectId") projectId: string,
    @Body(new ZodValidationPipe(createSectionValidation)) body: z.infer<typeof createSectionValidation>,
  ) {
    return this.sectionService.createSection(projectId, body);
  }

  @Get()
  findAll(@Param("projectId") projectId: string) {
    return this.sectionService.getSectionsByProject(projectId);
  }

  @Patch("reorder")
  reorder(
    @Param("projectId") projectId: string,
    @Body(new ZodValidationPipe(reorderSectionsValidation)) body: z.infer<typeof reorderSectionsValidation>,
  ) {
    return this.sectionService.reorder(projectId, body.orders);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSectionValidation)) body: z.infer<typeof updateSectionValidation>,
  ) {
    return this.sectionService.updateSection(id, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.sectionService.deleteSection(id);
  }
}
