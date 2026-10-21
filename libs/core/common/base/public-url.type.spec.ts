import { ENV } from "@config/env.config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PublicUrlType } from "./public-url.type";

describe("PublicUrlType", () => {
  const type = new PublicUrlType();
  const original = ENV.R2_PUBLIC_URL;

  beforeEach(() => {
    ENV.R2_PUBLIC_URL = "https://cdn.example.com";
  });

  afterEach(() => {
    ENV.R2_PUBLIC_URL = original;
  });

  it("lưu key: bỏ domain hiện tại khỏi link đầy đủ", () => {
    expect(type.convertToDatabaseValue("https://cdn.example.com/UserAvatars/u1/a.png")).toBe("UserAvatars/u1/a.png");
    expect(type.convertToDatabaseValue("UserAvatars/u1/a.png")).toBe("UserAvatars/u1/a.png");
  });

  it("đọc ra: ghép domain theo env, đổi env là đổi link", () => {
    expect(type.convertToJSValue("UserAvatars/u1/a.png")).toBe("https://cdn.example.com/UserAvatars/u1/a.png");
    ENV.R2_PUBLIC_URL = "https://files.example.org/";
    expect(type.convertToJSValue("UserAvatars/u1/a.png")).toBe("https://files.example.org/UserAvatars/u1/a.png");
  });

  it("giữ nguyên link ngoài và giá trị rỗng", () => {
    const external = "https://lh3.googleusercontent.com/a/xyz";
    expect(type.convertToDatabaseValue(external)).toBe(external);
    expect(type.convertToJSValue(external)).toBe(external);
    for (const empty of [null, undefined, ""]) {
      expect(type.convertToDatabaseValue(empty)).toBe(empty);
      expect(type.convertToJSValue(empty)).toBe(empty);
    }
  });
});
