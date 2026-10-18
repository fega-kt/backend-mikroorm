import { DepartmentEntity } from "@core-service/entities/department";
import { PrincipalEntity } from "@core-service/entities/principal";
import { UserEntity } from "@core-service/entities/user";
import type { EntityManager } from "@mikro-orm/core";
import { ApproverType, type Approver } from "./definition.schema";

export interface ResolveContext {
  requesterId: string;
  departmentId: string;
  /**
   * Giữ người trình khi họ chính là trưởng / phó phòng cần tìm (bước bật "bỏ qua nếu người duyệt là người tạo":
   * engine tự bỏ qua suất đó). Mặc định bỏ người trình ra và leo lên trưởng phòng cấp trên để người khác duyệt.
   */
  keepRequester?: boolean;
}

/** Một suất duyệt sau khi giải cấu hình: principal theo quy trình + người dùng tương ứng */
export interface SlotTarget {
  principalId: string | null;
  group: boolean;
  users: string[];
}

/** Số cấp phòng ban tối đa khi leo lên tìm trưởng phòng — chặn dữ liệu cây bị vòng */
const MAX_DEPTH = 20;

/**
 * Ứng viên nhận chuyển cấp trong một phòng, theo thứ tự ưu tiên phó phòng → trưởng phòng (lấy người đầu tiên còn hoạt động).
 * `ownDepartment`: phòng của chính người duyệt — chỉ lấy người xếp trên họ (phó phòng chỉ lên trưởng phòng,
 * trưởng phòng không chuyển xuống phó mà lên phòng cấp cha). Chưa lọc người bị khóa.
 */
export function escalationCandidates(userId: string, dept: { deputyId?: string; managerId?: string }, ownDepartment: boolean): string[] {
  const { deputyId, managerId } = dept;
  if (ownDepartment && userId === managerId) return [];
  if (ownDepartment && userId === deputyId) return managerId && managerId !== userId ? [managerId] : [];
  return [...new Set([deputyId, managerId].filter((id): id is string => !!id && id !== userId))];
}

/** Đổi cấu hình người duyệt trong quy trình thành user cụ thể, dựa trên trưởng/phó phòng ở bảng departments */
export class ApproverResolver {
  private readonly deptCache = new Map<string, DepartmentEntity | null>();
  private readonly activeCache = new Map<string, boolean>();

  constructor(private readonly em: EntityManager) {}

  /** Một cấu hình người duyệt → danh sách user (nhóm trả về các thành viên đang hoạt động) */
  async resolve(approver: Approver, ctx: ResolveContext): Promise<string[]> {
    const one = (id?: string) => (id ? [id] : []);
    const exclude = ctx.keepRequester ? undefined : ctx.requesterId;
    switch (approver.type) {
      case ApproverType.DeptHead:
        return one(await this.findDeptHead(ctx.departmentId, exclude));
      case ApproverType.DeptDeputy: {
        const dept = await this.getDepartment(ctx.departmentId);
        const deputyId = dept?.deputy?.id;
        if (deputyId && deputyId !== exclude && (await this.isActive(deputyId))) return [deputyId];
        return one(await this.findDeptHead(ctx.departmentId, exclude));
      }
      case ApproverType.SpecificUser:
        return (await this.isActive(approver.userId)) ? [approver.userId] : [];
      case ApproverType.Principal:
        return this.resolvePrincipal(approver.principalId);
      default:
        return [];
    }
  }

  /** Mỗi cấu hình là một suất duyệt: trả về danh sách user của từng suất (giữ thứ tự cấu hình) */
  async resolveSlots(approvers: Approver[], ctx: ResolveContext): Promise<string[][]> {
    const slots: string[][] = [];
    for (const approver of approvers) slots.push(await this.resolve(approver, ctx));
    return slots;
  }

  /**
   * Mỗi cấu hình người duyệt → một suất, kèm principal theo quy trình:
   * - Người (trưởng / phó phòng, người cụ thể, principal người): principal của người đó, `users` = [người đó].
   * - Nhóm: principal nhóm, `group` = true, `users` = thành viên đang hoạt động.
   * Không tìm được ai → `principalId` null, `users` rỗng.
   */
  async resolveSlotTargets(approvers: Approver[], ctx: ResolveContext): Promise<SlotTarget[]> {
    const slots: SlotTarget[] = [];
    for (const approver of approvers) {
      if (approver.type === ApproverType.Principal) {
        const principal = await this.em.findOne(
          PrincipalEntity,
          { id: approver.principalId, deleted: { $ne: true } },
          { fields: ["id", "user", "group"] },
        );
        if (principal && !principal.user && principal.group) {
          slots.push({ principalId: principal.id, group: true, users: await this.resolvePrincipal(principal.id) });
          continue;
        }
      }
      const [userId] = await this.resolve(approver, ctx);
      slots.push({ principalId: userId ? await this.principalOfUser(userId) : null, group: false, users: userId ? [userId] : [] });
    }
    return slots;
  }

  /** Principal của một người dùng */
  async principalOfUser(userId: string): Promise<string | null> {
    const principal = await this.em.findOne(PrincipalEntity, { user: userId, deleted: { $ne: true } }, { fields: ["id"] });
    return principal?.id ?? null;
  }

  /** Thành viên đang hoạt động của principal nhóm (rỗng nếu không phải nhóm) */
  async groupMembers(principalId: string): Promise<string[]> {
    return this.resolvePrincipal(principalId);
  }

  /** Giải nhiều cấu hình, gộp và bỏ trùng; trả về danh sách user id */
  async resolveMany(approvers: Approver[], ctx: ResolveContext): Promise<string[]> {
    return [...new Set((await this.resolveSlots(approvers, ctx)).flat())];
  }

  /** Principal user → chính user đó; principal nhóm → các thành viên đang hoạt động */
  private async resolvePrincipal(principalId: string): Promise<string[]> {
    const principal = await this.em.findOne(
      PrincipalEntity,
      { id: principalId, deleted: { $ne: true } },
      { fields: ["id", "type", "user", "group"] },
    );
    if (!principal) return [];
    if (principal.user) return (await this.isActive(principal.user.id)) ? [principal.user.id] : [];
    if (!principal.group) return [];
    const members = await this.em.find(
      UserEntity,
      { groups: principal.group.id, isActive: true, deleted: { $ne: true } },
      { fields: ["id"], orderBy: { fullName: "ASC" } },
    );
    return members.map((u) => u.id);
  }

  /**
   * Trưởng phòng của phòng ban; nếu trống, không còn hoạt động hoặc chính là `excludeUserId`
   * thì lấy trưởng phòng của phòng cấp cha, cứ thế đi lên.
   */
  async findDeptHead(departmentId: string, excludeUserId?: string): Promise<string | undefined> {
    let dept = await this.getDepartment(departmentId);
    for (let depth = 0; dept && depth < MAX_DEPTH; depth++) {
      const managerId = dept.manager?.id;
      if (managerId && managerId !== excludeUserId && (await this.isActive(managerId))) return managerId;
      dept = dept.parent ? await this.getDepartment(dept.parent.id) : null;
    }
    return undefined;
  }

  /**
   * Người nhận chuyển cấp lần 1: người kế trên gần nhất của người duyệt.
   * Nhân viên → phó phòng (không có thì trưởng phòng); phó phòng → trưởng phòng; trưởng phòng → phòng cấp trên.
   * Phòng không có ai phù hợp (trống / bị khóa / trùng chính người đó hoặc người trong `skip`, vd người trình)
   * thì "nhảy cóc" lên phòng cấp cha, cứ thế đi lên. Không tìm được ai → undefined (chỉ nhắc).
   */
  async escalationTarget(userId: string, skip: string[] = []): Promise<string | undefined> {
    const user = await this.em.findOne(UserEntity, { id: userId }, { fields: ["id", "department"] });
    if (!user?.department) return undefined;
    return this.escalateFrom(user.department.id, userId, new Set(skip), true);
  }

  /**
   * Người nhận chuyển cấp lần 2: người đang giữ là phó phòng của một phòng → trưởng phòng của chính phòng đó.
   * Lần 2 chỉ là "phó → trưởng cùng phòng", không lên phòng trên: phòng chỉ có một người (phó kiêm trưởng),
   * chưa có trưởng, trưởng bị khóa hoặc trưởng là người trong `skip` (vd người trình) → undefined (không chuyển nữa, chỉ nhắc).
   * Là phó ở nhiều phòng thì ưu tiên phòng ghi trong hồ sơ của họ.
   */
  async deputyEscalationTarget(userId: string, skip: string[] = []): Promise<string | undefined> {
    const [user, departments] = await Promise.all([
      this.em.findOne(UserEntity, { id: userId }, { fields: ["id", "department"] }),
      this.em.find(DepartmentEntity, { deputy: userId, deleted: { $ne: true } }, { fields: ["id", "manager"] }),
    ]);
    const ownFirst = [...departments].sort((a, b) => Number(b.id === user?.department?.id) - Number(a.id === user?.department?.id));
    for (const dept of ownFirst) {
      const managerId = dept.manager?.id;
      if (managerId && managerId !== userId && !skip.includes(managerId) && (await this.isActive(managerId))) return managerId;
    }
    return undefined;
  }

  /** Đi từ phòng `departmentId` lên gốc, lấy ứng viên đầu tiên còn hoạt động và không trùng người duyệt / người trong `skip` */
  private async escalateFrom(departmentId: string, userId: string, skip: Set<string>, ownDepartment: boolean) {
    let dept = await this.getDepartment(departmentId);
    const visited = new Set<string>();
    for (let depth = 0; dept && depth < MAX_DEPTH && !visited.has(dept.id); depth++) {
      visited.add(dept.id);
      const candidates = escalationCandidates(
        userId,
        { deputyId: dept.deputy?.id, managerId: dept.manager?.id },
        ownDepartment && depth === 0,
      );
      for (const id of candidates) {
        if (!skip.has(id) && (await this.isActive(id))) return id;
      }
      dept = dept.parent ? await this.getDepartment(dept.parent.id) : null;
    }
    return undefined;
  }

  /** Chuỗi phòng ban từ phòng hiện tại lên gốc: [phòng, cha, ông, ...] */
  async departmentChain(departmentId: string): Promise<string[]> {
    const chain: string[] = [];
    let dept = await this.getDepartment(departmentId);
    while (dept && chain.length < MAX_DEPTH && !chain.includes(dept.id)) {
      chain.push(dept.id);
      dept = dept.parent ? await this.getDepartment(dept.parent.id) : null;
    }
    return chain;
  }

  private async getDepartment(id: string): Promise<DepartmentEntity | null> {
    if (!this.deptCache.has(id)) {
      const dept = await this.em.findOne(
        DepartmentEntity,
        { id, deleted: { $ne: true } },
        { fields: ["id", "manager", "deputy", "parent"] },
      );
      this.deptCache.set(id, dept as DepartmentEntity | null);
    }
    return this.deptCache.get(id);
  }

  private async isActive(userId: string): Promise<boolean> {
    if (!this.activeCache.has(userId)) {
      const count = await this.em.count(UserEntity, { id: userId, isActive: true, deleted: { $ne: true } });
      this.activeCache.set(userId, count > 0);
    }
    return this.activeCache.get(userId);
  }
}
