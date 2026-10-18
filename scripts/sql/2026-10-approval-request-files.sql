-- Chuyển tệp của tờ trình từ hai bảng nối cũ (approval_requests_documents, approval_requests_attachments)
-- sang approval_request_files (lưu theo vòng duyệt).
--
-- Chạy MỘT LẦN sau khi deploy bản có approval_request_files (bảng do backend tự tạo lúc khởi động).
-- Chạy lại không sao: dòng đã có thì bỏ qua (on conflict do nothing).
--
-- Vòng gán cho tệp hiện có:
--   - nháp / bị trả lại: vòng đang soạn = round + 1 (đúng như bản người trình đang sửa)
--   - đã hủy khi còn là nháp (round = 0): vòng 1
--   - đang chờ / đã xong / bị từ chối / đã hủy sau khi gửi: vòng hiện tại = round
-- Tờ trình đang bị trả lại không dựng lại được bộ tệp của vòng vừa duyệt (trước đây không lưu theo vòng).
--
-- Hai bảng nối cũ KHÔNG bị xóa (đồng bộ schema an toàn không xóa bảng). Kiểm tra xong thì tự xóa:
--   drop table approval_requests_documents; drop table approval_requests_attachments;

begin;

with legacy as (
  select d.approval_request_entity_id as request_id, d.attachment_entity_id as attachment_id, 'documents' as category
  from approval_requests_documents d
  union all
  select a.approval_request_entity_id, a.attachment_entity_id, 'attachments'
  from approval_requests_attachments a
)
insert into approval_request_files (
  id, created_at, updated_at, deleted, created_by_id, updated_by_id,
  request_id, round, category, position, original_id, current_id, signature_count
)
select
  gen_random_uuid(), now(), now(), false, f.created_by_id, f.created_by_id,
  r.id,
  case
    when r.status in ('draft', 'returned') then r.round + 1
    when r.round = 0 then 1
    else r.round
  end,
  l.category,
  (row_number() over (partition by r.id, l.category order by f.created_at, f.id) - 1)::int,
  f.id, f.id, 0
from legacy l
join approval_requests r on r.id = l.request_id
join attachments f on f.id = l.attachment_id
on conflict do nothing;

-- Kiểm tra: số tệp cũ và số dòng mới theo từng loại phải khớp
select 'documents' as category,
  (select count(*) from approval_requests_documents) as legacy,
  (select count(*) from approval_request_files where category = 'documents') as migrated
union all
select 'attachments',
  (select count(*) from approval_requests_attachments),
  (select count(*) from approval_request_files where category = 'attachments');

commit;
