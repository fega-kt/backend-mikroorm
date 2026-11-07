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
import { buildActivityLogWhere } from "./activity-log-filter";

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
    await this.invalidateLists();
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
    const { page, limit } = query;
    const user = this.getCurrentUser();

    const where = await buildActivityLogWhere(this.repo.getEntityManager(), query, {
      all: user.canAccess([PermissionType.ViewActivityLogAll]),
      departmentId: user.department?.id,
    });
    if (!where) return { data: [], total: 0, page, limit };

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
