import { ENV } from "@config/env.config";
import { Injectable } from "@nestjs/common";
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";

@Injectable()
export class SupabaseService {
  private readonly admin: SupabaseClient;
  private readonly client: SupabaseClient;

  constructor() {
    this.admin = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    this.client = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_JWT_PUBLISHABLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async getUserByToken(token: string): Promise<User> {
    const { data, error } = await this.client.auth.getUser(token);
    if (error || !data.user) throw error ?? new Error("Invalid token");
    return data.user;
  }

  async signInWithPassword(email: string, password: string): Promise<User> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw error ?? new Error("Sign in failed");
    return data.user;
  }

  async listUsers(): Promise<User[]> {
    const { data, error } = await this.admin.auth.admin.listUsers();
    if (error || !data) throw error ?? new Error("Failed to list users");
    return data.users;
  }

  async createUser(params: {
    email: string;
    password?: string;
    emailConfirm?: boolean;
    userMetadata?: Record<string, unknown>;
  }): Promise<User> {
    const { data, error } = await this.admin.auth.admin.createUser({
      email: params.email,
      password: params.password,
      email_confirm: params.emailConfirm,
      user_metadata: params.userMetadata,
    });
    if (error || !data.user) throw error ?? new Error("Failed to create user");
    return data.user;
  }

  async updateUserPassword(userId: string, password: string): Promise<void> {
    const { error } = await this.admin.auth.admin.updateUserById(userId, { password });
    if (error) throw error;
  }

  async sendOtp(email: string): Promise<void> {
    await this.admin.auth.signInWithOtp({ email });
  }

  async createSessionFromEmail(email: string): Promise<{ access_token: string; refresh_token: string; expires_at: number }> {
    const { data: linkData, error: linkError } = await this.admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError || !linkData) throw linkError ?? new Error("Failed to generate magic link");

    const { data: sessionData, error: sessionError } = await this.client.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });
    if (sessionError || !sessionData.session) throw sessionError ?? new Error("Failed to create session");

    return {
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_at: sessionData.session.expires_at ?? 0,
    };
  }
}
