import { ENV } from "@config/env.config";
import { Injectable } from "@nestjs/common";
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";

/** ~100 năm — Supabase không có ban vô thời hạn, chỉ nhận số giờ */
const PERMANENT_BAN_DURATION = "876000h";

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

  /** Supabase merge user_metadata theo key, chỉ cần truyền các key thay đổi */
  async updateUserMetadata(userId: string, userMetadata: Record<string, unknown>): Promise<void> {
    const { error } = await this.admin.auth.admin.updateUserById(userId, { user_metadata: userMetadata });
    if (error) throw error;
  }

  async updateUserPassword(userId: string, password: string): Promise<void> {
    const { error } = await this.admin.auth.admin.updateUserById(userId, { password });
    if (error) throw error;
  }

  /**
   * Ban / gỡ ban tài khoản Supabase. Ban "vĩnh viễn" (Supabase chỉ nhận số giờ): từ chối đăng nhập và refresh token
   * cho tới khi gỡ ban. Idempotent; tài khoản không còn ở Supabase thì bỏ qua (không có gì để chặn).
   */
  async setBanned(authId: string, banned: boolean): Promise<void> {
    const { error } = await this.admin.auth.admin.updateUserById(authId, { ban_duration: banned ? PERMANENT_BAN_DURATION : "none" });
    if (error && error.code !== "user_not_found") throw error;
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
