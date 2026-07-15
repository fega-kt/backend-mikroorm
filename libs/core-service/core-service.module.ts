import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { SupabaseModule } from "@modules/supabase/supabase.module";
import { MailModule } from "@modules/mail/mail.module";
import { RabbitMQModule } from "@modules/rabbitmq/rabbitmq.module";
import { coreControllers } from "./controllers";
import { coreServices } from "./services";
import { coreEntities } from "./entities";
import { SupabaseAuthGuard } from "./guards/supabase-auth.guard";

@Module({
  imports: [
    SupabaseModule,
    MailModule,
    RabbitMQModule,
    MikroOrmModule.forFeature([...coreEntities]),
  ],
  controllers: [...coreControllers],
  providers: [
    ...coreServices,
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
  ],
  exports: [...coreServices],
})
export class CoreServiceModule {}
