import { BaseService } from "@common/base/base.service";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, Scope } from "@nestjs/common";
import { AttachmentEntity } from "../../entities/attachment";
import { UploadService } from "./upload.service";

@Injectable({ scope: Scope.REQUEST })
export class AttachmentService extends BaseService<AttachmentEntity> {
  constructor(
    @InjectRepository(AttachmentEntity)
    protected readonly repo: EntityRepository<AttachmentEntity>,
    private readonly uploadService: UploadService,
  ) {
    super();
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
