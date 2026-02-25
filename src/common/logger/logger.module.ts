import { Module } from "@nestjs/common";
import { WinstonModule } from "nest-winston";
import * as winston from "winston";

@Module({
  imports: [
    WinstonModule.forRoot({
      transports: [
        // console log
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp }) => `${timestamp} ${level}: ${message}`),
          ),
        }),

        // file error
        new winston.transports.File({
          filename: "logs/error.log",
          level: "error",
        }),

        // file all log
        new winston.transports.File({
          filename: "logs/app.log",
        }),
      ],
    }),
  ],
})
export class LoggerModule {}
