export enum PermissionType {
  /** ===== USER ===== */

  /** vào menu user */
  MenuUser = "permission:menu:user",

  /** xem chi tiết user */
  ViewUserDetail = "permission:user:view",

  /** tạo user */
  CreateUser = "permission:user:create",

  /** cập nhật user */
  UpdateUser = "permission:user:update",

  /** xóa user */
  DeleteUser = "permission:user:delete",

  /** ===== ROLE ===== */

  /** vào menu role */
  MenuRole = "permission:menu:role",

  /** xem chi tiết role */
  ViewRoleDetail = "permission:role:view",

  /** tạo role */
  CreateRole = "permission:role:create",

  /** cập nhật role */
  UpdateRole = "permission:role:update",

  /** xóa role */
  DeleteRole = "permission:role:delete",

  /** ===== DEPARTMENT ===== */

  /** vào menu department */
  MenuDeparment = "permission:menu:department",

  /** xem chi tiết department */
  ViewDeparmentDetail = "permission:department:view",

  /** tạo department */
  CreateDeparment = "permission:department:create",

  /** cập nhật department */
  UpdateDeparment = "permission:department:update",

  /** xóa department */
  DeleteDeparment = "permission:department:delete",
}
