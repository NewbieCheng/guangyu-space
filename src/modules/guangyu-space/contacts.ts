export const PARTNER_DIRECTIONS = [
  "资源互补",
  "联合交付",
  "渠道合作",
  "内容合作",
  "顾问支持",
  "其他",
] as const;

export type ContactMaterialLink = { id?: string; label: string; url: string };

export function contactMaterialLinks(value: unknown): ContactMaterialLink[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const link = item as Record<string, unknown>;
      if (typeof link.url !== "string") return [];
      return [
        {
          ...(typeof link.id === "string" ? { id: link.id } : {}),
          label: typeof link.label === "string" ? link.label : "",
          url: link.url,
        },
      ];
    });
  }

  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const divider = line.indexOf("|");
      if (divider < 0) return { label: line, url: line };
      return {
        label: line.slice(0, divider).trim(),
        url: line.slice(divider + 1).trim(),
      };
    })
    .filter((link) => link.url.length > 0);
}

export function contactFollowupDate(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const plannedDate = (value as Record<string, unknown>).plannedDate;
  return typeof plannedDate === "string" && plannedDate.length >= 10
    ? plannedDate.slice(0, 10)
    : null;
}

export function contactLinkPayload(
  value: unknown,
): Array<{ label: string; url: string }> {
  return contactMaterialLinks(value)
    .map(({ label, url }) => ({
      label: label.trim() || url.trim(),
      url: url.trim(),
    }))
    .filter((link) => link.url.length > 0);
}
