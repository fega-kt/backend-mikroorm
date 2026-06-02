import { ENV } from "@config/env.config";
import { Injectable, Logger } from "@nestjs/common";
import { ICacheService } from "@modules/cache/cache.interface";

@Injectable()
export class CloudflareKvService implements ICacheService {
  private readonly logger = new Logger(CloudflareKvService.name);
  private readonly baseUrl: string;
  private readonly keysUrl: string;
  private readonly headers: Record<string, string>;
  private readonly jsonHeaders: Record<string, string>;

  constructor() {
    const base = `https://api.cloudflare.com/client/v4/accounts/${ENV.CF_ACCOUNT_ID}/storage/kv/namespaces/${ENV.CF_KV_NAMESPACE_ID}`;
    this.baseUrl = `${base}/values`;
    this.keysUrl = `${base}/keys`;
    this.headers = { Authorization: `Bearer ${ENV.CF_KV_API_TOKEN}`, "Content-Type": "text/plain" };
    this.jsonHeaders = { Authorization: `Bearer ${ENV.CF_KV_API_TOKEN}`, "Content-Type": "application/json" };
  }

  async get<T = string>(key: string): Promise<T | null> {
    const res = await fetch(`${this.baseUrl}/${encodeURIComponent(key)}`, { headers: this.headers });
    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`KV get failed for key "${key}": ${text}`);
      throw new Error(`KV get failed: ${res.status}`);
    }
    const text = await res.text();
    return JSON.parse(text) as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${encodeURIComponent(key)}?expiration_ttl=${ttlSeconds}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(value),
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`KV set failed for key "${key}": ${text}`);
      throw new Error(`KV set failed: ${res.status}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.deleteOne(key)));
  }

  async delByPattern(pattern: string): Promise<void> {
    const prefix = pattern.replace(/\*$/, "");
    const keys = await this.listKeys(prefix);
    if (!keys.length) return;

    const bulkUrl = `${this.keysUrl.replace("/keys", "")}/bulk/delete`;
    const res = await fetch(bulkUrl, {
      method: "DELETE",
      headers: this.jsonHeaders,
      body: JSON.stringify(keys),
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`KV bulk delete failed for pattern "${pattern}": ${text}`);
      throw new Error(`KV bulk delete failed: ${res.status}`);
    }
  }

  private async deleteOne(key: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${encodeURIComponent(key)}`, { method: "DELETE", headers: this.headers });
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      this.logger.error(`KV delete failed for key "${key}": ${text}`);
      throw new Error(`KV delete failed: ${res.status}`);
    }
  }

  private async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const url = new URL(this.keysUrl);
      url.searchParams.set("prefix", prefix);
      url.searchParams.set("limit", "1000");
      if (cursor) url.searchParams.set("cursor", cursor);

      const res = await fetch(url.toString(), { headers: this.headers });
      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`KV list failed for prefix "${prefix}": ${text}`);
        throw new Error(`KV list failed: ${res.status}`);
      }

      const body = (await res.json()) as { result: { name: string }[]; result_info: { cursor?: string } };
      keys.push(...body.result.map((r) => r.name));
      cursor = body.result_info.cursor;
    } while (cursor);

    return keys;
  }
}
