-- Gỡ dữ liệu của module phê duyệt cũ (Flowable). Chạy một lần, thủ công, trên từng môi trường.
-- schema.updateSchema({ safe: true }) không tự drop bảng nên phải chạy script này.
-- Đặt search_path về DB_SCHEMA của môi trường trước khi chạy, ví dụ:
--   SET search_path TO public;

BEGIN;

DROP TABLE IF EXISTS workflow_delegation_settings_delegated_approvers CASCADE;
DROP TABLE IF EXISTS workflow_delegation_settings_request_types CASCADE;
DROP TABLE IF EXISTS workflow_delegation_settings_workflow_settings CASCADE;
DROP TABLE IF EXISTS workflow_delegation_settings CASCADE;
DROP TABLE IF EXISTS workflow_actions CASCADE;
DROP TABLE IF EXISTS workflow_tasks CASCADE;
DROP TABLE IF EXISTS workflow_instances CASCADE;
DROP TABLE IF EXISTS workflow_settings CASCADE;

-- Schema của Flowable engine (ACT_*)
DROP SCHEMA IF EXISTS flowable CASCADE;

-- Bỏ các quyền workflow cũ khỏi role
UPDATE roles
SET rights = ARRAY(
  SELECT r FROM unnest(rights) AS r
  WHERE r NOT LIKE 'permission:workflow-%'
    AND r NOT IN (
      'permission:menu:workflow-setting',
      'permission:menu:workflow-instance',
      'permission:menu:workflow-task',
      'permission:menu:workflow-delegation-setting'
    )
)
WHERE EXISTS (SELECT 1 FROM unnest(rights) AS r WHERE r LIKE 'permission:%workflow-%');

COMMIT;
