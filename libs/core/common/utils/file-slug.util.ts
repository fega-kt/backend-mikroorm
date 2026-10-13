/**
 * Tên file an toàn để đặt trong key lưu trữ: bỏ dấu tiếng Việt, chữ thường, ký tự lạ thành "-".
 * Chỉ để dễ đọc khi xem trực tiếp trên storage; tên gốc đầy đủ vẫn lưu ở cột `filename`.
 */
export function slugifyFilename(baseName: string, maxLength = 60): string {
  const slug = baseName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || "file";
}
