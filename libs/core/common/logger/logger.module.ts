import { DynamicModule, Module } from "@nestjs/common";
import { utilities as nestWinstonModuleUtilities, WinstonModule } from "nest-winston";
import * as winston from "winston";

@Module({})
export class LoggerModule {
  static forRoot(appName: string): DynamicModule {
    return {
      module: LoggerModule,
      imports: [
        WinstonModule.forRoot({
          transports: [
            new winston.transports.Console({
              format: winston.format.combine(
                winston.format.timestamp(),
                nestWinstonModuleUtilities.format.nestLike(appName, { colors: true, prettyPrint: true }),
              ),
            }),
            new winston.transports.File({
              filename: "logs/error.log",
              level: "error",
            }),
            new winston.transports.File({
              filename: "logs/app.log",
            }),
          ],
        }),
      ],
    };
  }
}
