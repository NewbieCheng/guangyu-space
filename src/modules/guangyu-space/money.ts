export function integerCents(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    try { return BigInt(value); } catch { return null; }
  }
  return null;
}

export type OrderCollectionStatus = "UNPAID" | "PARTIAL" | "PAID";

export function orderCollectionAmounts(amountValue: unknown, receivedValue: unknown): {
  receivedCents: bigint;
  receivableCents: bigint | null;
  collectionStatus: OrderCollectionStatus;
} {
  const amountCents = integerCents(amountValue);
  const receivedCents = integerCents(receivedValue) ?? 0n;
  const receivableCents = amountCents === null ? null : amountCents - receivedCents;

  // A zero cumulative receipt remains unpaid, including a zero-value order.
  const collectionStatus: OrderCollectionStatus = receivedCents <= 0n
    ? "UNPAID"
    : receivableCents === null || receivableCents > 0n
      ? "PARTIAL"
      : "PAID";

  return { receivedCents, receivableCents, collectionStatus };
}

export function formatMoney(value: unknown): string {
  if (value == null) return "待录入";
  const cents = integerCents(value);
  if (cents === null) return "金额无效";
  const sign = cents < 0n ? "-" : "";
  const absolute = cents < 0n ? -cents : cents;
  const yuan = new Intl.NumberFormat("zh-CN").format(absolute / 100n);
  const fen = (absolute % 100n).toString().padStart(2, "0");
  return `¥${sign}${yuan}.${fen}`;
}

export function yuanText(value: unknown): string {
  const cents = integerCents(value);
  if (cents === null) return "";
  const sign = cents < 0n ? "-" : "";
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

export function parseYuan(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error("金额请使用人民币元填写，最多两位小数。");
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("金额超出可保存范围。");
  return cents;
}
