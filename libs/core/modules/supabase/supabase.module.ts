import { Global, Module } from "@nestjs/common";
import { SupabaseAuthDbService } from "./supabase-auth-db.service";
import { SupabaseService } from "./supabase.service";

@Global()
@Module({
  providers: [SupabaseService, SupabaseAuthDbService],
  exports: [SupabaseService, SupabaseAuthDbService],
})
export class SupabaseModule {}
