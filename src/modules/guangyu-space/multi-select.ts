export type MultiSelectOption = readonly [value: string, label: string];

export function normalizeMultiSelectValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim() && !normalized.includes(item)) {
      normalized.push(item);
    }
  }
  return normalized;
}

export function filterMultiSelectOptions(
  options: readonly MultiSelectOption[],
  query: string,
): MultiSelectOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...options];

  return options.filter(([, label]) =>
    label.toLocaleLowerCase().includes(normalizedQuery),
  );
}

export function toggleMultiSelectValue(
  values: unknown,
  value: string,
  checked: boolean,
): string[] {
  const normalized = normalizeMultiSelectValues(values);
  if (!checked) return normalized.filter((item) => item !== value);
  if (normalized.includes(value)) return normalized;
  return [...normalized, value];
}
