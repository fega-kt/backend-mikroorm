import { Global, Module } from "@nestjs/common";
import { CloudflareKvService } from "./cloudflare-kv.service";

@Global()
@Module({
  providers: [CloudflareKvService],
  exports: [CloudflareKvService],
})
export class CloudflareKvModule {}
