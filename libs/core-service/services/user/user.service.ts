import { EntityData, EntityManager, EntityRepository, FilterQuery, serialize } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Scope } from "@nestjs/common";
import { isAuthApiError } from "@supabase/supabase-js";

import { BaseService } from "@common/base/base.service";
import { STORAGE_PATH } from "@common/constants/storage.constant";
import { MailService } from "@modules/mail/mail.service";
import { SupabaseService } from "@modules/supabase/supabase.service";
import z from "zod";
import { ActivityLogAction, ActivityLogType } from "../../entities/activity-log";
import { AppSettingType } from "../../entities/app-setting";
import { DepartmentEntity, DepartmentStatus } from "../../entities/department";
import { PrincipalEntity, PrincipalType } from "../../entities/principal";
import { UserEntity } from "../../entities/user";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { LogData, toLogRef } from "../activity-log/activity-log.util";
import { AppSettingService } from "../app-setting/app-setting.service";
import { AuthCacheKey } from "../auth/auth.constants";
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
    private readonly activityLogService: ActivityLogService,
  ) {
    super();
  }

  async create(data: z.infer<typeof createUserValidation>): Promise<void> {
    const result = createUserValidation.safeParse(data);

    if (!result.success) {
      throw new BadRequestException(result.error.format());
    }

    const { loginName, fullName, workEmail, password, department, isActive } = data;
    const [exist] = await Promise.all([this.repo.findOne({ loginName: { $ilike: loginName } }), this.assertDepartmentExists(department)]);

    if (exist) {
      throw new ConflictException("This email is already registered");
    }

    const authUser = await this.supabaseService
      .createUser({ email: loginName, password, emailConfirm: true, userMetadata: { fullName } })
      .catch((error: unknown) => {
        if (isAuthApiError(error) && error.code === "email_exists") {
          throw new ConflictException("This email is already registered");
        }
        throw new BadRequestException("Failed to create user in Supabase Auth: " + (error as Error).message);
      });

    const defaulValueBase = this.getDefaultValuesForCreate();
    const userId = await this.em.transactional(async (em) => {
      // 1️⃣ create user
      const user = this.repo.create({
        authId: authUser.id,
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
      return user.id;
    });

    await this.writeLog(userId, ActivityLogAction.CREATE, undefined, await this.loadLogData(userId));

    void this.sendAccountCreatedMail(loginName, fullName).catch((error: Error) => {
      this.logger.error("Failed to send account created email: " + error.message);
    });
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

    return await this.updateUserAndPrincipal(id, update);
  }

  /** Cập nhật user; nếu fullName đổi thì đồng bộ principal.name và user_metadata trên Supabase */
  private async updateUserAndPrincipal(id: string, data: EntityData<UserEntity>): Promise<UserEntity> {
    const baseUpdate = this.getDefaultValuesForUpdate();
    let principalId: string | undefined;
    let nameChanged = false;
    const oldData = await this.loadLogData(id);

    const user = await this.em.transactional(async (em) => {
      const user = await em.findOne(UserEntity, { id, deleted: { $ne: true } });
      if (!user) {
        throw new NotFoundException("User not found or deleted");
      }

      nameChanged = data.fullName !== undefined && data.fullName !== user.fullName;
      em.assign(user, { ...data, ...baseUpdate });

      if (nameChanged) {
        const principal = await em.findOne(PrincipalEntity, { user });
        if (principal) {
          em.assign(principal, { name: user.fullName, ...baseUpdate });
          principalId = principal.id;
        }
      }

      await em.flush();
      return user;
    });

    await Promise.all([
      this.cache.del(this.cacheKey(id), AuthCacheKey.user(id)),
      this.cache.delByPattern(`cache:${this.cachePrefix}:list:*`),
      ...(nameChanged ? [this.cache.delByPattern("cache:principal:list:*")] : []),
      ...(principalId ? [this.cache.del(`cache:principal:${principalId}`)] : []),
    ]);

    await this.writeLog(id, ActivityLogAction.UPDATE, oldData, await this.loadLogData(id));

    if (nameChanged && user.authId) {
      void this.supabaseService.updateUserMetadata(user.authId, { fullName: user.fullName }).catch((error: Error) => {
        this.logger.warn(`Failed to sync fullName to Supabase for ${user.loginName}: ${error.message}`);
      });
    }

    return user;
  }

  private async assertDepartmentExists(id: string): Promise<void> {
    const exists = await this.em.findOne(DepartmentEntity, id);
    if (!exists) {
      throw new BadRequestException("Department not found");
    }
  }

  async updateProfile(id: string, data: z.infer<typeof updateProfileValidation>) {
    return await this.updateUserAndPrincipal(id, data);
  }

  async remove(id: string) {
    const oldData = await this.loadLogData(id);
    const result = await super.remove(id);
    await this.cache.del(AuthCacheKey.user(id));
    await this.writeLog(id, ActivityLogAction.DELETE, oldData);
    return result;
  }

  async updateActive(id: string, isActive: boolean) {
    const user = await this.repo.findOne(
      { id, deleted: { $ne: true } },
      { fields: ["id", "isActive", "department", "department.deleted", "department.status"], populate: ["department"] },
    );
    if (!user) {
      throw new NotFoundException("User not found or deleted");
    }

    if (user.isActive === isActive) {
      throw new BadRequestException(`User is already ${isActive ? "active" : "inactive"}`);
    }

    if (isActive) {
      const { department } = user;
      if (!department || department.deleted) {
        throw new BadRequestException("Department not found or deleted");
      }
      if (department.status !== DepartmentStatus.ACTIVE) {
        throw new BadRequestException("Department is inactive");
      }
    }

    const oldData = await this.loadLogData(id);
    const result = await this.updateOne(id, { isActive });
    await this.cache.del(AuthCacheKey.user(id));
    await this.writeLog(id, ActivityLogAction.STATUS_CHANGE, oldData, await this.loadLogData(id));
    return result;
  }

  async uploadAvatar(id: string, file: Express.Multer.File) {
    const { url } = await this.uploadService.upload(file, `${STORAGE_PATH.USER_AVATAR}/${id}`);
    const oldData = await this.loadLogData(id);
    await this.updateOne(id, { avatar: url });
    await this.cache.del(AuthCacheKey.user(id));
    await this.writeLog(id, ActivityLogAction.UPDATE, oldData, await this.loadLogData(id));
    return url;
  }

  /** Lịch sử thao tác của user, mới nhất trước; vẫn xem được sau khi bản ghi bị xóa mềm */
  getHistory(id: string, page: number, limit: number) {
    return this.activityLogService.findByParent(id, page, limit, undefined, this.tableName);
  }

  /** Dữ liệu user ghi vào activity log; đọc thẳng từ DB (bỏ qua identity map) để phản ánh đúng trạng thái đã lưu */
  private async loadLogData(id: string): Promise<LogData | undefined> {
    const user = await this.repo.findOne(
      { id },
      {
        fields: [
          "fullName",
          "loginName",
          "workEmail",
          "phoneNumber",
          "description",
          "avatar",
          "isActive",
          "department",
          "department.id",
          "department.name",
        ],
        populate: ["department"],
        disableIdentityMap: true,
      },
    );
    if (!user) return undefined;

    return {
      fullName: user.fullName,
      loginName: user.loginName,
      workEmail: user.workEmail ?? null,
      phoneNumber: user.phoneNumber ?? null,
      description: user.description ?? null,
      avatar: user.avatar ?? null,
      isActive: user.isActive,
      department: toLogRef(user.department, user.department?.name),
    };
  }

  /** parentId là id của user */
  private writeLog(id: string, action: ActivityLogAction, oldData?: LogData, newData?: LogData) {
    return this.activityLogService.addOne({
      parentId: id,
      type: ActivityLogType.User,
      parentType: this.tableName,
      action,
      oldData,
      newData,
    });
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
