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

  /** ===== NOTIFICATION ===== */

  /** xem notification */
  MenuNotification = "permission:menu:notification",

  /** ===== CATEGORY ===== */

  /** vào menu category */
  MenuCategory = "permission:menu:category",

  /** xem chi tiết category */
  ViewCategoryDetail = "permission:category:view",

  /** tạo category */
  CreateCategory = "permission:category:create",

  /** cập nhật category */
  UpdateCategory = "permission:category:update",

  /** xóa category */
  DeleteCategory = "permission:category:delete",

  /** ===== REQUEST TYPE ===== */

  /** vào menu request type */
  MenuRequestType = "permission:menu:request-type",

  /** xem chi tiết request type */
  ViewRequestTypeDetail = "permission:request-type:view",

  /** tạo request type */
  CreateRequestType = "permission:request-type:create",

  /** cập nhật request type */
  UpdateRequestType = "permission:request-type:update",

  /** xóa request type */
  DeleteRequestType = "permission:request-type:delete",

  /** ===== APPROVAL WORKFLOW ===== */

  /** vào menu quy trình phê duyệt (danh sách + thiết kế) */
  MenuApprovalWorkflow = "permission:menu:approval-workflow",

  /** tạo quy trình phê duyệt */
  CreateApprovalWorkflow = "permission:approval-workflow:create",

  /** sửa thông tin + lưu bản nháp quy trình */
  UpdateApprovalWorkflow = "permission:approval-workflow:update",

  /** xuất bản phiên bản quy trình */
  PublishApprovalWorkflow = "permission:approval-workflow:publish",

  /** xóa quy trình phê duyệt */
  DeleteApprovalWorkflow = "permission:approval-workflow:delete",

  /** ===== EMAIL TEMPLATE ===== */

  /** vào menu mẫu email */
  MenuEmailTemplate = "permission:menu:email-template",

  /** tạo / sửa / xoá mẫu email, khôi phục mẫu hệ thống */
  UpdateEmailTemplate = "permission:email-template:update",

  /** ===== APPROVAL REQUEST (quản trị) ===== */

  /** vào menu tất cả đơn + xem chi tiết mọi đơn */
  MenuAllApprovalRequest = "permission:menu:approval-request-all",

  /** gán lại người duyệt của bước đang chờ (vd: người duyệt nghỉ việc) */
  ReassignApprovalTask = "permission:approval-task:reassign",

  /** ===== APP SETTING ===== */

  /** vào menu app setting */
  MenuAppSetting = "permission:menu:app-setting",

  /** xem chi tiết app setting */
  ViewAppSettingDetail = "permission:app-setting:view",

  /** thiết lập giá trị cho app setting chưa cấu hình */
  CreateAppSetting = "permission:app-setting:create",

  /** cập nhật app setting */
  UpdateAppSetting = "permission:app-setting:update",

  /** xóa giá trị app setting (về trạng thái chưa cấu hình) */
  DeleteAppSetting = "permission:app-setting:delete",

  /** ===== GROUP ===== */

  /** vào menu group */
  MenuGroup = "permission:menu:group",

  /** xem chi tiết group */
  ViewGroupDetail = "permission:group:view",

  /** tạo group */
  CreateGroup = "permission:group:create",

  /** cập nhật group */
  UpdateGroup = "permission:group:update",

  /** xóa group */
  DeleteGroup = "permission:group:delete",

  /** ===== ACTIVITY LOG QUEUE ===== */

  /** xem danh sách activity log queue */
  ViewActivityLogQueue = "permission:activity-log-queue:view",

  /** retry activity log queue item */
  RetryActivityLogQueue = "permission:activity-log-queue:retry",

  /** ===== ACTIVITY LOG ===== */

  /** vào menu theo dõi activity log */
  MenuActivityLog = "permission:menu:activity-log",

  /** xem activity log toàn hệ thống */
  ViewActivityLogAll = "permission:activity-log:view-all",

  /** xem activity log trong phòng ban của mình và các phòng ban con (log do user trong các phòng đó thực hiện, và log auth của họ) */
  ViewActivityLogDepartment = "permission:activity-log:view-department",
}
