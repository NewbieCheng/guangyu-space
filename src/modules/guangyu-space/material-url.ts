export function toLocalFileUrl(value: string): string {
  let target: URL;
  if (/^file:/i.test(value)) target = new URL(value);
  else if (/^[a-z]:[\\/]/i.test(value)) target = new URL(`file:///${value.replaceAll("\\", "/")}`);
  else if (value.startsWith("/")) target = new URL(`file://${value}`);
  else throw new Error("请输入完整的本机路径，例如 /Users/name/资料.docx 或 C:\\资料\\资料.docx。");
  if (target.protocol !== "file:" || (target.host && target.host !== "localhost") || target.username || target.password || target.port || target.search || target.hash) {
    throw new Error("仅支持当前设备上的本机文件路径。");
  }
  return target.href;
}
