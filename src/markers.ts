export type MarkerJsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<MarkerJsonValue>
  | { readonly [key: string]: MarkerJsonValue };
export type MarkerMetadata = { readonly [key: string]: MarkerJsonValue };

/** A badge anchored to an exact timestamp in the main OHLC series. */
export type ChartMarker = {
  id: string;
  timestamp: number;
  text: string;
  position: 'above' | 'below';
  backgroundColor: string;
  textColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  /** Scales the text and default padding, minimum dimensions and corner radius. */
  fontSize?: number;
  paddingHorizontal?: number;
  paddingVertical?: number;
  minWidth?: number;
  minHeight?: number;
  offset?: number;
  metadata?: MarkerMetadata;
};

export type ResolvedChartMarker = Required<Omit<ChartMarker, 'metadata'>> & {
  metadata?: MarkerMetadata;
};
export type MarkerPressEvent = Readonly<{
  marker: ResolvedChartMarker;
  x: number;
  y: number;
}>;

// Runtime type checks are required at this JSON serialization boundary, including
// calls from JavaScript consumers that do not have TypeScript validation.
/* oxlint-disable anti-slop/no-runtime-typeof */
function cloneJson(
  value: MarkerJsonValue,
  ancestors: Set<object>
): MarkerJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || value === null)
    throw new TypeError('marker.metadata must be JSON-compatible');
  if (ancestors.has(value))
    throw new TypeError('marker.metadata cannot contain cycles');
  ancestors.add(value);
  try {
    if (Array.isArray(value))
      return Array.from(value, (item: MarkerJsonValue) =>
        cloneJson(item, ancestors)
      );
    if (
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    ) {
      throw new TypeError('marker.metadata must contain only plain objects');
    }
    if (Object.getOwnPropertySymbols(value).length)
      throw new TypeError('marker.metadata cannot contain symbol keys');
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]: [string, MarkerJsonValue]) => [
          key,
          cloneJson(item, ancestors),
        ])
    );
  } finally {
    ancestors.delete(value);
  }
}

function resolveMetadata(
  metadata: MarkerMetadata | undefined
): MarkerMetadata | undefined {
  if (metadata === undefined) return undefined;
  const result = cloneJson(metadata, new Set());
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    throw new TypeError('marker.metadata must be an object');
  }
  // SAFETY: cloneJson validated and cloned every member; arrays and primitives were excluded above.
  return result as MarkerMetadata;
}
/* oxlint-enable anti-slop/no-runtime-typeof */

const defaults = {
  borderWidth: 0,
  borderRadius: 6,
  fontSize: 14,
  paddingHorizontal: 6,
  paddingVertical: 4,
  minWidth: 24,
  minHeight: 24,
  offset: 6,
} as const;

export function resolveMarker(marker: ChartMarker): ResolvedChartMarker {
  if (marker.id.trim().length === 0) {
    throw new TypeError('marker.id must be a non-empty string');
  }
  if (!Number.isSafeInteger(marker.timestamp) || marker.timestamp < 0) {
    throw new TypeError(
      'marker.timestamp must be a non-negative integer in milliseconds'
    );
  }
  if (!/^[\x20-\x7e]{1,5}$/.test(marker.text) || !marker.text.trim()) {
    throw new TypeError(
      'marker.text must contain 1–5 printable ASCII characters and not be blank'
    );
  }
  if (marker.position !== 'above' && marker.position !== 'below') {
    throw new TypeError('marker.position must be above or below');
  }
  const fontSize = marker.fontSize ?? defaults.fontSize;
  const sizeScale = fontSize / defaults.fontSize;
  const result: ResolvedChartMarker = {
    id: marker.id,
    timestamp: marker.timestamp,
    text: marker.text,
    position: marker.position,
    backgroundColor: marker.backgroundColor,
    textColor: marker.textColor ?? '#FFFFFF',
    borderColor: marker.borderColor ?? marker.backgroundColor,
    borderWidth: marker.borderWidth ?? defaults.borderWidth,
    borderRadius: marker.borderRadius ?? defaults.borderRadius * sizeScale,
    fontSize,
    paddingHorizontal:
      marker.paddingHorizontal ?? defaults.paddingHorizontal * sizeScale,
    paddingVertical:
      marker.paddingVertical ?? defaults.paddingVertical * sizeScale,
    minWidth: marker.minWidth ?? defaults.minWidth * sizeScale,
    minHeight: marker.minHeight ?? defaults.minHeight * sizeScale,
    offset: marker.offset ?? defaults.offset,
  };
  result.metadata = resolveMetadata(marker.metadata);
  for (const field of [
    'backgroundColor',
    'textColor',
    'borderColor',
  ] as const) {
    if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(result[field])) {
      throw new TypeError(`marker.${field} must be #RRGGBB or #RRGGBBAA`);
    }
    result[field] = result[field].toUpperCase();
  }
  const numericFields = [
    'borderWidth',
    'borderRadius',
    'fontSize',
    'paddingHorizontal',
    'paddingVertical',
    'minWidth',
    'minHeight',
    'offset',
  ] as const;
  for (const field of numericFields) {
    const value = result[field];
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      (field === 'fontSize' && value === 0)
    ) {
      throw new TypeError(
        `marker.${field} must be finite and ${field === 'fontSize' ? 'positive' : 'non-negative'}`
      );
    }
  }
  return result;
}

export function resolveMarkers(markers: ReadonlyArray<ChartMarker>) {
  const ids = new Set<string>();
  return markers.map((marker) => {
    const resolved = resolveMarker(marker);
    if (ids.has(resolved.id))
      throw new TypeError('markers must have unique ids');
    ids.add(resolved.id);
    return resolved;
  });
}
