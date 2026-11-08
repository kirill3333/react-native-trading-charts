export function jsonRoundTrip<T>(value: T): T {
  // SAFETY: these inputs are resolved chart configs composed exclusively of
  // JSON-safe fields; the round trip preserves their validated contract.
  return JSON.parse(JSON.stringify(value)) as T;
}
