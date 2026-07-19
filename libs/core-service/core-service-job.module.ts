import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { SupabaseModule } from "@modules/supabase/supabase.module";
import { MailModule } from "@modules/mail/mail.module";
import { RabbitMQModule } from "@modules/rabbitmq/rabbitmq.module";
import { coreServices } from "./services";
import { coreEntities } from "./entities";

@Module({
  imports: [SupabaseModule, MailModule, RabbitMQModule, MikroOrmModule.forFeature([...coreEntities])],
  providers: [...coreServices],
  exports: [...coreServices],
})
export class CoreServiceJobModule {}
