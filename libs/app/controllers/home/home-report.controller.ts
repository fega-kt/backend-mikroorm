import { Public } from "@common/decorators/public.decorator";
import { ZodValidationPipe } from "@common/pipes/zod-validation-pipe";
import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { lineBodyValidation, pieQueryValidation } from "./home-report.validation";
import { HomeReportService } from "../../services/home/home-report.service";

@Controller("home-report")
@Public()
export class HomeReportController {
  constructor(private readonly homeReportService: HomeReportService) {}

  @Get("pie")
  getPie(@Query(new ZodValidationPipe(pieQueryValidation)) query: z.infer<typeof pieQueryValidation>) {
    return this.homeReportService.getPie(query.by);
  }

  @Post("line")
  getLine(@Body(new ZodValidationPipe(lineBodyValidation)) body: z.infer<typeof lineBodyValidation>) {
    return this.homeReportService.getLine(body.range);
  }
}
