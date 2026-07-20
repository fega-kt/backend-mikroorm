import { EntityData, EntityManager, EntityRepository, FilterQuery, serialize } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Scope } from "@nestjs/common";

import { BaseService } from "@common/base/base.service";
import { STORAGE_PATH } from "@common/constants/storage.constant";
import { MailService } from "@modules/mail/mail.service";
import { SupabaseService } from "@modules/supabase/supabase.service";
import z from "zod";
import { AppSettingType } from "../../entities/app-setting";
import { DepartmentEntity } from "../../entities/department";
import { PrincipalEntity, PrincipalType } from "../../entities/principal";
import { UserEntity } from "../../entities/user";
import { AppSettingService } from "../app-setting/app-setting.service";
import { UploadService } from "../upload/upload.service";
import {
  createUserValidation,
  updateProfileValidation,
  updateUserValidation,
  UserListFilterDto,
} from "../../controllers/user/user.validation";

@Injectable({ scope: Scope.REQUEST })
export class UserService extends BaseService<UserEntity> {
  private logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(UserEntity)
    protected readonly repo: EntityRepository<UserEntity>,
    private readonly em: EntityManager,
    private readonly uploadService: UploadService,
    private readonly supabaseService: SupabaseService,
    private readonly mailService: MailService,
    private readonly appSettingService: AppSettingService,
  ) {
    super();
  }

  async create(data: z.infer<typeof createUserValidation>): Promise<void> {
    const result = createUserValidation.safeParse(data);

    if (!result.success) {
      throw new BadRequestException(result.error.format());
    }

    const { loginName, fullName, workEmail, password, department, isActive } = data;
    const exist = await this.repo.findOne({ loginName: { $ilike: loginName } });

    if (exist) {
      throw new ConflictException("Email already exists in local database");
    }

    await this.assertDepartmentExists(department);

    const users = await this.supabaseService.listUsers().catch((error: Error) => {
      throw new BadRequestException("Failed to check Supabase user: " + error.message);
    });

    if (!users.find((u) => u.email === loginName)) {
      await this.supabaseService
        .createUser({ email: loginName, password, emailConfirm: true, userMetadata: { fullName } })
        .catch((error: Error) => {
          throw new BadRequestException("Failed to create user in Supabase Auth: " + error.message);
        });
    }

    const defaulValueBase = this.getDefaultValuesForCreate();
    const res = await this.em.transactional(async (em) => {
      // 1️⃣ create user
      const user = this.repo.create({
        fullName,
        loginName,
        workEmail,
        isActive: isActive !== undefined ? isActive : true,
        department: em.getReference(DepartmentEntity, department),
        ...defaulValueBase,
      });

      em.persist(user);

      // 2️⃣ create principal
      const principal = em.create(PrincipalEntity, {
        name: fullName,
        type: PrincipalType.User,
        user,
        ...defaulValueBase,
      });

      em.persist(principal);

      await em.flush();
    });
    await this.sendAccountCreatedMail(loginName, fullName).catch((error: Error) => {
      this.logger.error("Failed to send account created email: " + error.message);
    });
    return res;
  }

  async findAllUser({ page = 1, limit = 10, keyword, fullName, phoneNumber, isActive }: UserListFilterDto) {
    const filter: FilterQuery<UserEntity> = { deleted: { $ne: true } };
    if (keyword) {
      filter.$or = [{ fullName: { $ilike: `%${keyword}%` } }, { loginName: { $ilike: `%${keyword}%` } }];
    }
    if (fullName) {
      filter.fullName = { $ilike: `%${fullName}%` };
    }
    if (phoneNumber) {
      filter.phoneNumber = { $ilike: `%${phoneNumber}%` };
    }
    if (isActive !== undefined) {
      filter.isActive = isActive ? true : { $ne: true };
    }

    const { data, total } = await this.paginate(filter, {
      limit,
      page,
      fields: [
        "id",
        "fullName",
        "workEmail",
        "createdAt",
        "updatedAt",
        "isActive",
        "loginName",
        "avatar",
        "phoneNumber",
        "department",
        "department.id",
        "department.name",
        "createdBy",
        "createdBy.id",
        "createdBy.fullName",
        "createdBy.avatar",
        "updatedBy",
        "updatedBy.id",
        "updatedBy.fullName",
        "updatedBy.avatar",
      ],
      populate: ["department", "createdBy", "updatedBy"],
      sort: { updatedAt: "DESC" },
    });

    return { data: serialize(data, { populate: ["department", "createdBy", "updatedBy"], forceObject: true }), total };
  }

  async getDetail(id: string) {
    const user = await this.findOne(
      { id, deleted: { $ne: true } },
      {
        fields: ["id", "fullName", "loginName", "workEmail", "avatar", "isActive", "department", "groups", "department.name"],
        populate: ["department", "groups"],
      },
    );

    if (!user) {
      throw new NotFoundException("User not found or deleted");
    }

    return user;
  }

  async update(id: string, data: z.infer<typeof updateUserValidation>) {
    const result = updateUserValidation.safeParse(data);

    if (!result.success) {
      throw new BadRequestException(result.error.format());
    }

    const { department, ...rest } = data;
    await this.assertDepartmentExists(department);

    const update: EntityData<UserEntity> = { ...rest, department: this.em.getReference(DepartmentEntity, department) };

    return await this.updateOne(id, update);
  }

  private async assertDepartmentExists(id: string): Promise<void> {
    const exists = await this.em.findOne(DepartmentEntity, id);
    if (!exists) {
      throw new BadRequestException("Department not found");
    }
  }

  async updateProfile(id: string, data: z.infer<typeof updateProfileValidation>) {
    return await this.updateOne(id, data);
  }

  async remove(id: string) {
    return await super.remove(id);
  }

  async uploadAvatar(id: string, file: Express.Multer.File) {
    const { url } = await this.uploadService.upload(file, `${STORAGE_PATH.USER_AVATAR}/${id}`);
    await this.updateOne(id, { avatar: url });
    return url;
  }

  private async sendAccountCreatedMail(email: string, fullName: string): Promise<void> {
    const templateId = await this.appSettingService.getString(AppSettingType.MAIL_TEMPLATE_ACCOUNT_CREATED);
    if (!templateId) {
      this.logger.warn("Account created mail template ID not configured");
      return;
    }
    await this.mailService.sendWithTemplate({
      to: email,
      templateId,
      variables: { USER_NAME: fullName, LOGIN_EMAIL: email },
    });
  }
}
