// Native indicator periods are stored as uint32_t.
export const MAX_INTEGER_SETTING_VALUE = 4_294_967_295;

export function parseSettingNumber(
  text: string,
  requireInteger: boolean
): number | null {
  const normalizedText = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalizedText)) return null;

  const value = Number(normalizedText);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (
    requireInteger &&
    (!Number.isInteger(value) || value > MAX_INTEGER_SETTING_VALUE)
  ) {
    return null;
  }
  return value;
}
