/** Một bình luận như hàng đợi hiển thị: nội dung bình luận đã xóa không được lộ ra ngoài */
export interface CommentRow {
  id: string;
  parentId: string | null;
  content: string | null;
  deleted: boolean;
}

/** Số cấp tối đa của một luồng bình luận (gốc = cấp 1); bình luận ở cấp này không trả lời tiếp được */
export const MAX_COMMENT_DEPTH = 3;

export type CommentNode<T extends CommentRow> = T & { replies: CommentNode<T>[] };

/**
 * Dựng cây bình luận: `roots` là các bình luận gốc (đã phân trang), `descendants` là mọi bình luận bên dưới chúng
 * (nhiều cấp, `parentId` trỏ đúng bình luận được trả lời), theo thứ tự thời gian — con của cùng một cha giữ nguyên thứ tự đó.
 * Bình luận đã xóa bị bỏ nội dung; nó vẫn giữ chỗ khi bên dưới còn bình luận chưa xóa (để phản hồi còn ngữ cảnh),
 * còn không có gì bên dưới thì ẩn hẳn. Bình luận gốc luôn được giữ chỗ để phân trang theo gốc không lệch.
 */
export function buildCommentThreads<T extends CommentRow>(roots: T[], descendants: T[]): CommentNode<T>[] {
  const byParent = new Map<string, T[]>();
  for (const row of descendants) {
    if (!row.parentId) continue;
    byParent.set(row.parentId, [...(byParent.get(row.parentId) ?? []), row]);
  }

  const build = (row: T): CommentNode<T> => ({
    ...row,
    content: row.deleted ? null : row.content,
    replies: (byParent.get(row.id) ?? []).map(build).filter((child) => !child.deleted || child.replies.length > 0),
  });
  return roots.map(build);
}
