import { ENV } from "@config/env.config";
import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class CloudflareKvService {
  private readonly logger = new Logger(CloudflareKvService.name);
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor() {
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${ENV.CF_ACCOUNT_ID}/storage/kv/namespaces/${ENV.CF_KV_NAMESPACE_ID}/values`;
    this.headers = {
      Authorization: `Bearer ${ENV.CF_KV_API_TOKEN}`,
      "Content-Type": "text/plain",
    };
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${encodeURIComponent(key)}?expiration_ttl=${ttlSeconds}`, {
      method: "PUT",
      headers: this.headers,
      body: value,
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`KV set failed for key "${key}": ${text}`);
      throw new Error(`KV set failed: ${res.status}`);
    }
  }

  async get(key: string): Promise<string | null> {
    const res = await fetch(`${this.baseUrl}/${encodeURIComponent(key)}`, { headers: this.headers });
    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`KV get failed for key "${key}": ${text}`);
      throw new Error(`KV get failed: ${res.status}`);
    }
    return res.text();
  }

  async delete(key: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: this.headers,
    });
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      this.logger.error(`KV delete failed for key "${key}": ${text}`);
      throw new Error(`KV delete failed: ${res.status}`);
    }
  }
}
