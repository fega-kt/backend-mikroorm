import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { CategoryService } from "../service/category.service";
import { categoryFilterValidation, createCategoryValidation, updateCategoryValidation } from "../validation/category.validation";

@Controller("category")
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @Permissions(PermissionType.CreateCategory)
  create(@Body(new ZodValidationPipe(createCategoryValidation)) data: z.infer<typeof createCategoryValidation>) {
    return this.categoryService.createCategory(data);
  }

  @Get()
  @Permissions(PermissionType.MenuCategory)
  findAll(@Query(new ZodValidationPipe(categoryFilterValidation)) query: z.infer<typeof categoryFilterValidation>) {
    return this.categoryService.getCategories(query);
  }

  @Get(":id")
  @Permissions(PermissionType.ViewCategoryDetail)
  findOne(@Param("id") id: string) {
    return this.categoryService.getCategoryById(id);
  }

  @Patch(":id")
  @Permissions(PermissionType.UpdateCategory)
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateCategoryValidation)) data: z.infer<typeof updateCategoryValidation>) {
    return this.categoryService.updateCategory(id, data);
  }

  @Delete(":id")
  @Permissions(PermissionType.DeleteCategory)
  remove(@Param("id") id: string) {
    return this.categoryService.deleteCategory(id);
  }
}
