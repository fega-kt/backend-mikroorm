import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Global, Module } from "@nestjs/common";
import { OutboxEventEntity } from "./outbox-event.entity";
import { OutboxService } from "./outbox.service";

@Global()
@Module({
  imports: [MikroOrmModule.forFeature([OutboxEventEntity])],
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
