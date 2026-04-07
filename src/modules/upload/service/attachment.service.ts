import { BaseService } from "@common/base/base.service";
import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Inject, Injectable, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { UploadService } from "./upload.service";
import { AttachmentEntity } from "../entity/attachment.entity";

@Injectable({ scope: Scope.REQUEST })
export class AttachmentService extends BaseService<AttachmentEntity> {
  constructor(
    @Inject(REQUEST) protected request: Request | undefined,
    @InjectRepository(AttachmentEntity)
    repo: EntityRepository<AttachmentEntity>,
    private readonly uploadService: UploadService,
  ) {
    super(repo, request);
  }

  async uploadAndCreate(file: Express.Multer.File, path: string): Promise<AttachmentEntity> {
    const { key, url } = await this.uploadService.upload(file, path);

    return this.addOne({
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      key,
      url,
      storagePath: path,
    });
  }
}
