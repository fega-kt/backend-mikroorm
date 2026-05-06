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

  /** ===== PROJECT ===== */

  /** vào menu project */
  MenuProject = "permission:menu:project",

  /** xem chi tiết project */
  ViewProjectDetail = "permission:project:view",

  /** tạo project */
  CreateProject = "permission:project:create",

  /** cập nhật project */
  UpdateProject = "permission:project:update",

  /** xóa project */
  DeleteProject = "permission:project:delete",

  /** ===== SECTION ===== */

  /** tạo section */
  CreateSection = "permission:section:create",

  /** cập nhật section */
  UpdateSection = "permission:section:update",

  /** xóa section */
  DeleteSection = "permission:section:delete",

  /** ===== TASK ===== */

  /** vào menu task */
  MenuTask = "permission:menu:task",

  /** xem chi tiết task */
  ViewTaskDetail = "permission:task:view",

  /** tạo task */
  CreateTask = "permission:task:create",

  /** cập nhật task */
  UpdateTask = "permission:task:update",

  /** xóa task */
  DeleteTask = "permission:task:delete",

  /** giao task */
  AssignTask = "permission:task:assign",

  /** ===== PROJECT MEMBER ===== */

  /** xem thành viên dự án */
  ViewProjectMember = "permission:project-member:view",

  /** thêm thành viên vào dự án */
  AddProjectMember = "permission:project-member:add",

  /** cập nhật vai trò thành viên */
  UpdateProjectMember = "permission:project-member:update",

  /** xóa thành viên khỏi dự án */
  RemoveProjectMember = "permission:project-member:remove",

  /** ===== SPRINT ===== */

  /** vào menu sprint */
  MenuSprint = "permission:menu:sprint",

  /** xem chi tiết sprint */
  ViewSprintDetail = "permission:sprint:view",

  /** tạo sprint */
  CreateSprint = "permission:sprint:create",

  /** cập nhật sprint */
  UpdateSprint = "permission:sprint:update",

  /** xóa sprint */
  DeleteSprint = "permission:sprint:delete",

  /** ===== MILESTONE ===== */

  /** vào menu milestone */
  MenuMilestone = "permission:menu:milestone",

  /** xem chi tiết milestone */
  ViewMilestoneDetail = "permission:milestone:view",

  /** tạo milestone */
  CreateMilestone = "permission:milestone:create",

  /** cập nhật milestone */
  UpdateMilestone = "permission:milestone:update",

  /** xóa milestone */
  DeleteMilestone = "permission:milestone:delete",

  /** ===== TIME LOG ===== */

  /** vào menu timelog */
  MenuTimeLog = "permission:menu:timelog",

  /** xem timelog */
  ViewTimeLog = "permission:timelog:view",

  /** tạo timelog (log giờ làm) */
  CreateTimeLog = "permission:timelog:create",

  /** duyệt / từ chối timelog */
  ApproveTimeLog = "permission:timelog:approve",

  /** xóa timelog */
  DeleteTimeLog = "permission:timelog:delete",

  /** ===== COMMENT ===== */

  /** tạo comment */
  CreateComment = "permission:comment:create",

  /** cập nhật comment */
  UpdateComment = "permission:comment:update",

  /** xóa comment */
  DeleteComment = "permission:comment:delete",

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
}
