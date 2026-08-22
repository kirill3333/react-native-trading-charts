const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

export function normalizeHexColor(value: string): string {
  return value.trim().toUpperCase();
}

export function isHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(normalizeHexColor(value));
}
