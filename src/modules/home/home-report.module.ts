import { Module } from "@nestjs/common";
import { HomeReportController } from "./controller/home-report.controller";
import { HomeReportService } from "./service/home-report.service";

@Module({
  controllers: [HomeReportController],
  providers: [HomeReportService],
})
export class HomeReportModule {}
