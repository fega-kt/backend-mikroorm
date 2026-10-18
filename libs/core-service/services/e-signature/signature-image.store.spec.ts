import type { EntityManager } from "@mikro-orm/core";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { UploadService } from "../upload/upload.service";
import { SignatureImageStore } from "./signature-image.store";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const dataUrl = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString("base64")}`;

function setup() {
  const upload = {
    putPrivateObjectUnique: vi.fn(async (folder: string, name: string) => `${folder}/${name}`),
    getObjectBuffer: vi.fn(async () => PNG),
    deleteObject: vi.fn(async () => undefined),
  };
  const em = {
    create: vi.fn((_entity: unknown, data: Record<string, unknown>) => data),
    getReference: vi.fn((_entity: unknown, id: string) => ({ id })),
    persist: vi.fn(),
  };
  return { upload, em, store: new SignatureImageStore(upload as unknown as UploadService) };
}

describe("SignatureImageStore", () => {
  it("uploads a PNG under SignatureImages/{userId} in the private bucket", async () => {
    const { upload, em, store } = setup();
    const file = (await store.save(em as unknown as EntityManager, "u1", dataUrl("image/png", PNG))) as unknown as Record<string, unknown>;
    expect(upload.putPrivateObjectUnique).toHaveBeenCalledWith("SignatureImages/u1", "signature.png", PNG, "image/png");
    expect(file).toMatchObject({ key: "SignatureImages/u1/signature.png", mimetype: "image/png", size: PNG.length, visibility: "private" });
  });

  it("rejects content that is not really a PNG / JPEG", async () => {
    const { upload, em, store } = setup();
    const fake = dataUrl("image/png", Buffer.from("<svg onload=alert(1)>"));
    await expect(store.save(em as unknown as EntityManager, "u1", fake)).rejects.toBeInstanceOf(BadRequestException);
    await expect(store.save(em as unknown as EntityManager, "u1", "data:image/gif;base64,R0lGOD")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(upload.putPrivateObjectUnique).not.toHaveBeenCalled();
  });

  it("rejects images over 200KB", async () => {
    const { em, store } = setup();
    const big = Buffer.concat([PNG, Buffer.alloc(201 * 1024)]);
    await expect(store.save(em as unknown as EntityManager, "u1", dataUrl("image/png", big))).rejects.toBeInstanceOf(BadRequestException);
  });

  it("reads the image back as a data URL for its owner", async () => {
    const { store } = setup();
    const url = await store.toDataUrl({ id: "f1", key: "k", mimetype: "image/png" } as never);
    expect(url).toBe(dataUrl("image/png", PNG));
  });
});
