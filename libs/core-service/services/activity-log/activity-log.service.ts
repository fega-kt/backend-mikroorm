import { getRequestInfo } from "@common/request-context";
import { BaseService } from "@common/base/base.service";
import { IUserResponse } from "@common/base/consts";
import { PermissionType } from "@common/base/permission-type.enum";
import { EntityRepository, FilterQuery, RequiredEntityData } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, InternalServerErrorException, Logger, Scope } from "@nestjs/common";
import { z } from "zod";
import { activityLogFilterValidation } from "../../controllers/activity-log/activity-log.validation";
import { ActivityLogAction, ActivityLogEntity, ActivityLogSubject } from "../../entities/activity-log";
import { DepartmentEntity } from "../../entities/department";
import { UserEntity } from "../../entities/user";

/** parentType hợp lệ ngoài tên bảng */
const SUBJECTS = new Set<string>(Object.values(ActivityLogSubject));

@Injectable({ scope: Scope.REQUEST })
export class ActivityLogService extends BaseService<ActivityLogEntity> {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    @InjectRepository(ActivityLogEntity)
    protected readonly repo: EntityRepository<ActivityLogEntity>,
  ) {
    super();
  }

  async addOne(data: RequiredEntityData<ActivityLogEntity>, options?: { user?: IUserResponse }) {
    this.assertParentType(data);
    return super.addOne({ ...data, ...this.getRequestMeta() }, options);
  }

  /** Ghi nhiều log trong một lần flush (vd: thao tác lan xuống các phòng ban con) */
  async addMany(items: RequiredEntityData<ActivityLogEntity>[]) {
    if (!items.length) return;
    items.forEach((item) => this.assertParentType(item));
    const em = this.repo.getEntityManager();
    const base = { ...this.getDefaultValuesForCreate(), ...this.getRequestMeta() };
    items.forEach((item) => em.persist(this.repo.create({ ...item, ...base })));
    await em.flush();
    await this.cache.delByPattern(`cache:${this.cachePrefix}:list:*`);
  }

  /**
   * parentType phải là tên một bảng có thật (lấy từ metadata nên tự cập nhật khi thêm entity) hoặc một giá trị ActivityLogSubject.
   * Vẫn chặn trường hợp quên truyền: muốn ghi unknown thì phải truyền rõ ràng.
   */
  private assertParentType({ parentType, parentId, action }: RequiredEntityData<ActivityLogEntity>) {
    if (SUBJECTS.has(parentType)) {
      if (parentType === ActivityLogSubject.Unknown) {
        this.logger.warn(`Bypass parentType validation (unknown): parentId=${parentId} action=${action}`);
      }
      return;
    }
    const tableNames = Object.values(this.repo.getEntityManager().getMetadata().getAll()).map((meta) => meta.tableName);
    if (!parentType || !tableNames.includes(parentType)) {
      throw new InternalServerErrorException(`Invalid activity log parentType: ${parentType ?? "(missing)"}`);
    }
  }

  private getRequestMeta() {
    return {
      ip: this.request?.ip || "N/A",
      device: this.request?.headers["user-agent"] || "N/A",
      requestId: getRequestInfo()?.requestId || "N/A",
    };
  }

  /**
   * Danh sách log có lọc. Có ViewActivityLogAll thì xem toàn hệ thống, chỉ có ViewActivityLogDepartment thì giới hạn trong phòng ban của user
   * và các phòng ban con: log do user trong các phòng đó thực hiện, cộng log auth (parentType = auth) của user trong các phòng đó (kể cả khi do hệ thống ghi).
   * User không thuộc phòng ban nào thì không thấy log nào.
   */
  async search(query: z.infer<typeof activityLogFilterValidation>) {
    const { page, limit, action, type, parentType, parentId, actorId, from, to } = query;
    const user = this.getCurrentUser();

    const conditions: FilterQuery<ActivityLogEntity>[] = [{ deleted: { $ne: true } }];
    if (action) conditions.push({ action });
    if (type) conditions.push({ type });
    if (parentType) conditions.push({ parentType });
    if (parentId) conditions.push({ parentId });
    if (actorId) conditions.push({ createdBy: actorId });
    if (from) conditions.push({ createdAt: { $gte: from } });
    if (to) conditions.push({ createdAt: { $lte: to } });

    if (!user.canAccess([PermissionType.ViewActivityLogAll])) {
      const departmentIds = await this.getDepartmentTreeIds(user.department?.id);
      if (!departmentIds.length) return { data: [], total: 0, page, limit };

      const members = await this.repo
        .getEntityManager()
        .find(UserEntity, { department: { $in: departmentIds }, deleted: { $ne: true } }, { fields: ["id"] });
      conditions.push({
        $or: [
          { createdBy: { department: { $in: departmentIds } } },
          { parentType: ActivityLogSubject.Auth, parentId: { $in: members.map((m) => m.id) } },
        ],
      });
    }

    return this.paginate(
      { $and: conditions },
      {
        page,
        limit,
        fields: [
          "id",
          "parentId",
          "parentType",
          "action",
          "type",
          "oldData",
          "newData",
          "ip",
          "device",
          "requestId",
          "createdAt",
          "createdBy",
          "createdBy.id",
          "createdBy.fullName",
          "createdBy.avatar",
        ],
        populate: ["createdBy"],
        sort: { createdAt: "DESC" },
      },
    );
  }

  /**
   * Id phòng ban của user và toàn bộ phòng ban con (mọi cấp). Phòng con xác định theo parentCode (path code, vd "a.b"),
   * cùng quy ước với DepartmentService.remove. Trả mảng rỗng nếu user không thuộc phòng nào hoặc phòng đã bị xóa.
   */
  private async getDepartmentTreeIds(departmentId: string | undefined): Promise<string[]> {
    if (!departmentId) return [];
    const em = this.repo.getEntityManager();

    const department = await em.findOne(
      DepartmentEntity,
      { id: departmentId, deleted: { $ne: true } },
      { fields: ["id", "code", "parentCode"] },
    );
    if (!department) return [];

    const ownPath = department.parentCode ? `${department.parentCode}.${department.code}` : department.code;
    const escapedOwnPath = ownPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const descendants = await em.find(
      DepartmentEntity,
      { deleted: { $ne: true }, parentCode: { $re: `^${escapedOwnPath}(\\.|$)` } as never },
      { fields: ["id"] },
    );

    return [department.id, ...descendants.map((d) => d.id)];
  }

  /** parentType: chỉ lấy log của đúng loại bản ghi, để endpoint của màn này không đọc được log của bảng khác */
  findByParent(parentId: string, page: number, limit: number, action?: ActivityLogAction, parentType?: string) {
    const where: FilterQuery<ActivityLogEntity> = { parentId, deleted: { $ne: true } };
    if (action) where.action = action;
    if (parentType) where.parentType = parentType;

    return this.paginate(where, {
      page,
      limit,
      fields: [
        "id",
        "parentId",
        "parentType",
        "action",
        "type",
        "oldData",
        "newData",
        "ip",
        "device",
        "requestId",
        "createdAt",
        "createdBy",
        "createdBy.id",
        "createdBy.fullName",
        "createdBy.avatar",
      ],
      populate: ["createdBy"],
      sort: { createdAt: "DESC" },
    });
  }
}
