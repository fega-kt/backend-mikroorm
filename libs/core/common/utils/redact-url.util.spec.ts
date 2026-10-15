import { describe, expect, it } from "vitest";
import { redactUrl } from "./redact-url.util";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJmaWxlIjoiMSJ9.abcdefGHIJKL";

describe("redactUrl", () => {
  it("che token trong path stream, chừa 6 ký tự cuối", () => {
    expect(redactUrl(`/api/file-view/stream/${JWT}`)).toBe("/api/file-view/stream/***GHIJKL");
  });

  it("giữ query khác khi che token trong path", () => {
    expect(redactUrl(`/api/file-view/stream/${JWT}?x=1`)).toBe("/api/file-view/stream/***GHIJKL?x=1");
  });

  it("giá trị ngắn thì che hết", () => {
    expect(redactUrl("/api/file-view/stream/abc123")).toBe("/api/file-view/stream/***");
  });

  it("che query param nhạy cảm, giữ param thường", () => {
    expect(redactUrl("/a?page=1&token=secret&X-Amz-Signature=sig")).toBe("/a?page=1&token=***&X-Amz-Signature=***");
  });

  it("URL thường giữ nguyên", () => {
    expect(redactUrl("/api/approval-request/123?page=1")).toBe("/api/approval-request/123?page=1");
  });
});
