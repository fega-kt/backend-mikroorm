import urljoin from "url-join";

type UrlJoinOptions = {
  removeLeadingSlash?: boolean;
  removeTrailingSlash?: boolean;
};

export const urlJoin = (urls: readonly (string | number | undefined)[], options?: UrlJoinOptions): string => {
  let joined = urljoin(...urls.map((url) => `${url == null || url === "" ? "/" : url}`));

  if (!joined) return "";

  // luôn gộp // ở giữa thành /
  joined = joined.replace(/\/{2,}/g, "/");

  if (options?.removeLeadingSlash) {
    joined = joined.replace(/^\/+/, "");
  }

  if (options?.removeTrailingSlash) {
    joined = joined.replace(/\/+$/, "");
  }

  return joined;
};

export const replaceStart = (input: string, find: string, replaceBy: string): string => {
  if (!input.startsWith(find)) return input;
  if (input === find) return replaceBy;
  return `${replaceBy}${input.substring(find.length)}`.replace(/\/{2,}/, "/");
};

export const getFileExtension = (fileName: string): string => {
  const dotIndex = fileName.lastIndexOf(".");
  const NOT_FOUND = -1;
  return dotIndex === NOT_FOUND ? "" : fileName.substring(fileName.lastIndexOf(".") + 1);
};
