import { Controller, Get } from "@nestjs/common";
import { AppRoute } from "../entity";
import { RouteService } from "../service/route.service";

@Controller("route")
export class RouteController {
  constructor(private readonly routeService: RouteService) {}

  @Get("get-async-routes")
  asyncRoutes(): AppRoute[] {
    return this.routeService.handleGetRouteWithPermission();
  }
}
