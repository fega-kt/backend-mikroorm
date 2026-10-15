type ErrorLike = NodeJS.ErrnoException & {
  errors?: unknown[];
  address?: string;
  port?: number;
  $metadata?: { httpStatusCode?: number; requestId?: string };
};

function describeOne(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const e = error as ErrorLike;
  // Lỗi mạng (ECONNREFUSED...) có địa chỉ; lỗi AWS/R2 có mã HTTP và request id để tra log phía R2
  const address = e.address ? ` (${e.address}:${e.port})` : "";
  const http = e.$metadata?.httpStatusCode
    ? ` (http ${e.$metadata.httpStatusCode}${e.$metadata.requestId ? `, requestId ${e.$metadata.requestId}` : ""})`
    : "";
  return `${e.code ?? e.name}: ${e.message || "no message"}${address}${http}`;
}

/**
 * Mô tả lỗi thành một dòng text đọc được để ghi log.
 * Error object tự nó in ra `{}` và AggregateError (vd Redis không kết nối được) có message rỗng,
 * nên phải bung `errors[]` và lấy mã lỗi, địa chỉ, mã HTTP ra thành chuỗi.
 */
export function describeError(error: unknown): string {
  const nested = (error as ErrorLike | undefined)?.errors;
  if (Array.isArray(nested) && nested.length) return nested.map(describeOne).join(" | ");
  return describeOne(error);
}
