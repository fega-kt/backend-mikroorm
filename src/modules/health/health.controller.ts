import { Public } from "@common/decorators/public.decorator";
import { Controller, Get } from "@nestjs/common";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  async health() {
    return this.healthService.check();
  }

  @Get("version")
  @Public()
  version() {
    return this.healthService.version();
  }
}
