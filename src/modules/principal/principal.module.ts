import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { PrincipalController } from "./controller/principal.controller";
import { PrincipalEntity } from "./entity/principal.entity";
import { PrincipalService } from "./service/principal.service";

@Module({
  imports: [MikroOrmModule.forFeature([PrincipalEntity])],
  providers: [PrincipalService],
  controllers: [PrincipalController],
  exports: [PrincipalService],
})
export class PrincipalModule {}
