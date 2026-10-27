export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_BYTES = 72;

export function normalizeUsername(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function validateUsername(value: string): string | null {
  const normalized = normalizeUsername(value);
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._-]{2,31}$/u.test(normalized)) {
    return "用户名需为 3–32 位，以字母或数字开头，可包含字母、数字、点、下划线和连字符。";
  }
  return null;
}

export function validatePassword(value: string): string | null {
  if ([...value].length < MIN_PASSWORD_LENGTH) {
    return `密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符。`;
  }
  if (new TextEncoder().encode(value).byteLength > MAX_PASSWORD_BYTES) {
    return "密码不能超过 72 个 UTF-8 字节。";
  }
  return null;
}
