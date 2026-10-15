/** Đoạn path chứa token trong URL (vd /file-view/stream/<token>) */
const TOKEN_PATH_SEGMENT = /(\/stream\/)([^/?#]+)/gi;

/** Query param nhạy cảm (token, chữ ký link R2...) */
const SENSITIVE_QUERY_PARAM = /([?&](?:token|access_token|refresh_token|signature|x-amz-signature|x-amz-credential|password)=)([^&#]*)/gi;

/** Số ký tự cuối được giữ lại để đối chiếu log (đầu JWT luôn giống nhau nên giữ phần cuối) */
const VISIBLE_TAIL = 6;

/** Giá trị ngắn quá thì che hết, tránh để lộ gần như cả giá trị */
const MIN_LENGTH_TO_SHOW_TAIL = 24;

function mask(value: string): string {
  return value.length >= MIN_LENGTH_TO_SHOW_TAIL ? `***${value.slice(-VISIBLE_TAIL)}` : "***";
}

/**
 * Che token và tham số nhạy cảm trong URL request trước khi ghi log, chỉ chừa vài ký tự cuối để đối chiếu
 * (URL có token ngắn hạn vẫn dùng được nếu lộ nguyên vẹn).
 */
export function redactUrl(url: string): string {
  return url
    .replace(TOKEN_PATH_SEGMENT, (_match, prefix: string, value: string) => `${prefix}${mask(value)}`)
    .replace(SENSITIVE_QUERY_PARAM, (_match, prefix: string, value: string) => `${prefix}${mask(value)}`);
}
