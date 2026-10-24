# Plan: người tạo đặt sẵn vị trí ký cho các bước

Trạng thái: đã code (chưa commit), chưa chạy thử trên app và chưa chạy integration test.

## Đã làm khác so với dự kiến ban đầu

- **Không chặn gửi khi thiếu ô.** Tờ trình chỉ gắn phiên bản quy trình lúc gửi (`pickWorkflowVersion`), không phải lúc tạo,
  nên `nodeId` đặt lúc soạn có thể không còn khớp. Ô là tùy chọn: thiếu hoặc lệch bước thì người duyệt tự đặt như cũ.
- **PDF và Word / Excel / PowerPoint.** Office được chuyển **tạm** sang PDF để xem và đặt khung, không lưu vào bộ tệp của tờ trình:
  `GET file-view/:fileId/view-pdf` dùng chung `OfficeConverter` và bản cache theo tệp (`pdfDownloadKeyOf`) với lúc ký / tải PDF,
  nên tọa độ khớp với bản PDF dùng để ký. Ảnh, zip... không ký được nên không có ô.
- **Đặt ô sau khi tạo.** Tệp chỉ lên storage khi bấm Lưu nháp, nên màn đặt ô chỉ mở được sau khi tờ trình đã được tạo (xem mục Luồng).
- Màn đặt ô lưu riêng qua `PATCH /approval-request/:id` với `signSlots` (không phụ thuộc nút Lưu nháp của form).
- Bị trả lại sang vòng mới: ô được sao chép theo bản sao của tệp.
- Preview trả thêm `requireSignature` ở từng bước để biết bước nào cần ô.

## Mục tiêu

Với tờ trình có ký số, người tạo đặt sẵn khung chữ ký cho từng bước duyệt trên file PDF.
Người duyệt chỉ xác nhận (hoặc dời nếu không bị khóa) thay vì tự kéo thả.

## Hiện trạng

- Người duyệt tự đặt khung ký lúc duyệt (`sign-approve-modal.tsx`, `placements` trong `approval-task.validation.ts`).
- Vị trí thực tế ghi ở `ApprovalFileSignatureEntity.placement` (mỗi lần ký một dòng, gắn với `task`).
- Người tạo chưa có quyền gì với vị trí ký.

## Quyết định

| Vấn đề | Chọn | Lý do |
| --- | --- | --- |
| Lưu ở đâu | Bảng riêng `approval_file_sign_slots` | Đúng quy ước repo, có FK/unique/cascade, dễ mở rộng, truy vấn được |
| Gắn với gì | Từng file của vòng (`requestFile`) + bước (`nodeId`) | Vị trí phụ thuộc file; lúc tạo chưa biết ai duyệt nên khóa theo bước, không theo user |
| Nhóm / nhiều người | Mặc định dùng chung một ô (`slot = 0`) | Ai trong nhóm ký cũng được; cần ô riêng thì tăng `slot` |
| Người duyệt có được dời | Có, trừ khi `locked` | Đặt sẵn là gợi ý, khóa cho trường hợp pháp lý chặt |
| Bước không bắt buộc ký | Không cần ô | |

## Dữ liệu

`approval_file_sign_slots` (entity `ApprovalFileSignatureSlotEntity`, kế thừa `BaseEntity`)

| Field | Kiểu | Ghi chú |
| --- | --- | --- |
| `id`, audit, `deleted` | từ `BaseEntity` | |
| `requestFile` | FK → `ApprovalRequestFileEntity` | `deleteRule: "cascade"` (xóa cứng ở DB), có index |
| `nodeId` | string | bước trong phiên bản quy trình |
| `slot` | integer, mặc định 0 | thứ tự suất trong bước; 0 là ô dùng chung |
| `placement` | JSON `{ page, x, y, width, height }` | điểm PDF, gốc dưới-trái, cùng đơn vị với `placement` hiện có |
| `locked` | boolean, mặc định false | true thì người duyệt không được dời |

Ràng buộc: unique `(requestFile, nodeId, slot)`.

Không lưu nhãn: nhãn trên ô lấy từ tên bước (`node.name`) theo `nodeId`.

`request` và `round` suy ra được từ `requestFile` nên **bỏ khỏi bảng** để tránh dữ liệu lặp, truy vấn theo tờ trình thì join qua `requestFile`.
(Nếu sau này cần lọc nhanh theo tờ trình mới cân nhắc thêm lại.)

Giữ nguyên `ApprovalFileSignatureEntity.placement` để ghi vị trí ký thực tế.

## Migration

Repo **không có file migration**: thư mục `migrations/` trống, `CLAUDE.md` ghi MikroORM dùng `autoLoadEntities: true`
và `orm.schema.updateSchema({ safe: true })` lúc khởi động (tự đồng bộ PostgreSQL, chế độ safe không bao giờ drop cột/bảng).

Vì vậy không viết migration. Việc cần làm:

1. Tạo entity `libs/app/entities/approval-file-sign-slot/approval-file-sign-slot.entity.ts` (+ `index.ts`).
2. Export trong `libs/app/entities/index.ts` như `ApprovalFileSignatureEntity` để `autoLoadEntities` nhận.
3. Khởi động lại backend: bảng, FK, index và unique được tạo tự động.

Cần để ý:

- Chế độ safe chỉ thêm, không sửa / xóa. Sau này đổi tên hoặc đổi kiểu cột sẽ phải xử lý tay (SQL hoặc tạo cột mới rồi chuyển dữ liệu).
- Unique `(requestFile, nodeId, slot)` và cascade xóa tạo lúc bảng mới, nên chốt trong entity ngay từ đầu.
- Môi trường chạy thật: xác nhận cùng cơ chế auto-sync đang bật ở đó trước khi deploy.

## Luồng

Đặt ô là bước **sau khi tờ trình đã được tạo** (đã lưu nháp). Lý do: file chỉ được upload lên storage khi bấm Lưu
(`attachment-upload` chế độ manual), trước đó không có file nào để xem và đặt ô.

1. **Tạo tờ trình:** người tạo nhập form, chọn file, bấm **Lưu nháp**. File lên storage, tờ trình có id và có dòng file (`ApprovalRequestFileEntity`).
   Form chuyển sang màn sửa của chính tờ trình đó.
2. **Đặt vị trí ký (sau khi tạo):** trong màn sửa, khối "Vị trí ký" mở màn đặt ô. Chỉ hiện khi luồng dự kiến có bước bắt buộc ký.
   Chọn văn bản PDF và bước, nhấp lên trang để đặt khung (kéo / đổi kích thước / khóa). Bấm **Lưu vị trí ký** là lưu ngay
   (`PATCH /approval-request/:id` với `signSlots`), độc lập với nút Lưu nháp. Có thể mở lại và sửa nhiều lần khi còn nháp / bị trả lại.
   - Chưa lưu nháp: nút mở màn đặt ô bị khóa kèm gợi ý "Lưu nháp trước".
   - Văn bản Word / Excel / PowerPoint: lần mở đầu chờ chuyển sang PDF (vài giây đến vài chục giây tùy dung lượng), các lần sau dùng bản cache.
3. **Gửi tờ trình:** không bắt buộc đã đặt ô. Thiếu ô hoặc ô lệch bước (quy trình đổi sau khi đặt, vì phiên bản quy trình chỉ chốt lúc gửi)
   thì người duyệt tự đặt như cũ. Gửi thẳng ở màn tạo mới (`submit: true`) cũng không có bước đặt ô.
4. **Thay / xóa file khi đang soạn:** `request-files.ts` xóa cứng dòng file (`em.remove`) khi người tạo bỏ file khỏi bộ tệp đang soạn
   (vòng `request.round + 1`). Ô gắn với file đó mất theo nhờ `deleteRule: "cascade"` ở DB; người tạo cần đặt lại ô cho file mới.
   - Chỉ bộ tệp đang soạn mới bị xóa; vòng đã gửi đi không sửa nên ô của vòng cũ giữ nguyên.
   - Sắp xếp lại thứ tự giữ nguyên dòng file nên ô không mất.
   - Thay file bằng file khác = xóa dòng cũ + thêm dòng mới (id mới) nên ô cũ mất.
5. **Bị trả lại:** `copyFilesToNextRound` tạo bản sao file cho vòng mới và sao chép ô theo, nên người tạo không phải đặt lại.
6. **Người duyệt ký:** `approval-signing.service.ts` chọn vị trí theo thứ tự
   1. ô đặt sẵn đang `locked` (bắt buộc dùng, không dời được)
   2. vị trí người duyệt tự dời (`input.placements`)
   3. ô đặt sẵn theo `(requestFile, nodeId)` của task
   4. tự đặt như hiện tại
7. Kết quả vẫn ghi vào `ApprovalFileSignatureEntity.placement`.

## Các bước làm

1. Entity `approval_file_sign_slots` + export (không cần file migration, xem mục Migration). — xong
2. `signSlots` ở create / update (thay toàn bộ ô của văn bản đang soạn), chi tiết tờ trình trả `signSlots` cho người tạo. — xong
3. `approval-signing.service.ts`: chọn vị trí theo thứ tự ưu tiên; `prepare` trả `preset`. Sao chép ô khi bị trả lại. — xong
4. Preview trả `requireSignature` ở từng bước. — xong
5. FE: màn đặt ô mở từ màn sửa tờ trình (sau khi lưu nháp); `sign-approve-modal.tsx` hiển thị ô đặt sẵn, khóa kéo nếu `locked`. — xong
6. Chưa làm: test (ưu tiên chọn vị trí, cascade khi xóa file, sao chép ô khi trả lại); chạy thử trên app.

## Còn cần xác nhận

- Môi trường chạy thật có bật auto-sync schema giống môi trường dev không (bảng mới được tạo lúc khởi động).
- Gửi thẳng ở màn tạo mới không qua bước đặt ô: có cần nhắc người tạo ("luồng có bước ký, đặt vị trí ký trước khi gửi?") không.
- Quyền sửa ô sau khi đã gửi: hiện không cho sửa (API chỉ nhận khi tờ trình còn nháp / bị trả lại).
