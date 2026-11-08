import { resolveBaselineAppearance, resolveBaseValue } from './baselineConfig';
import {
  type AdditionalOhlcSeriesOptions,
  type AdditionalChartSeriesOptions,
  type ChartAppearance,
  type ChartBorderStyle,
  type ChartFormatters,
  type ChartLineAppearance,
  type ChartPaneOptions,
  type ChartSeriesType,
  type ChartSeriesOptions,
  type ChartTheme,
  type ChartTextStyle,
  type CompactValueFormat,
  type CrosshairTooltipField,
  type HistogramSeriesOptions,
  type MacdSeriesOptions,
  type SarSeriesOptions,
  type NormalizedSarSeriesOptions,
  type BollSeriesOptions,
  type NormalizedBollSeriesOptions,
  type MovingAverageSeriesOptions,
  type NormalizedAdditionalChartSeriesOptions,
  type OhlcValueSource,
  type PriceDisplayFormat,
  type PriceValueFormat,
  type ResolvedChartResolution,
  type ResolvedChartAppearance,
  type ResolvedChartConfig,
  type ResolvedChartPaneOptions,
  type ResolvedAdditionalChartSeriesOptions,
  type ResolvedChartFormatters,
  type ResolvedChartTextStyle,
  type ResolvedPriceDisplayFormat,
  type ResolvedTradeAggregationOptions,
  type ResolvedTradingSessionSegment,
  type ResolutionUnit,
  type WilliamsRSeriesOptions,
  type KdjSeriesOptions,
  type NormalizedKdjSeriesOptions,
  type RsiSeriesOptions,
  type SignificantValueFormat,
  type TradingChartsViewProps,
  type TradingSessionSegment,
  type TradingWeekday,
  type VolumeValueFormat,
  type YAxisValueFormat,
} from './types';

const RESOLUTION_UNITS = new Set<string>([
  'second',
  'minute',
  'hour',
  'day',
  'week',
  'month',
]);

const CHART_SERIES_TYPES = new Set<string>([
  'candlestick',
  'hollowCandlestick',
  'bar',
  'line',
  'area',
  'baseline',
]);

const ADDITIONAL_SERIES_TYPES = new Set<string>([
  ...CHART_SERIES_TYPES,
  'histogram',
  'boll',
  'kdj',
  'sar',
  'macd',
]);

const DEFAULT_THEME = {
  backgroundColor: '#100C18',
  gridColor: '#292431',
  axisTextColor: '#9791A5',
  upColor: '#38D98A',
  downColor: '#FF3B64',
  crosshairColor: '#A8A2B3',
  tooltipBackgroundColor: '#1B1723',
  tooltipTextColor: '#F5F2FA',
} as const;

const DEFAULT_CROSSHAIR_TOOLTIP_LABELS = {
  open: 'Open',
  close: 'Close',
  high: 'High',
  low: 'Low',
  amplitude: 'Amplitude',
  changePercent: 'Change %',
  change: 'Change',
  volume: 'Volume',
} as const;

const DEFAULT_CROSSHAIR_TOOLTIP_FIELDS: ReadonlyArray<CrosshairTooltipField> = [
  'open',
  'close',
  'high',
  'low',
  'amplitude',
  'changePercent',
  'change',
  'volume',
];

const INT32_MAX = 2_147_483_647;
const UINT32_MAX = 0xffff_ffff;
const MINIMUM_SCALE_CONTENT_FRACTION = 1e-6;

const CROSSHAIR_TOOLTIP_FIELD_SET = new Set<string>(
  DEFAULT_CROSSHAIR_TOOLTIP_FIELDS
);

function finitePositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number`);
  }
  return value;
}

function finiteNonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number`);
  }
  return value;
}

function resolveTooltipFields(
  input: ReadonlyArray<CrosshairTooltipField> | undefined
): CrosshairTooltipField[] {
  const fields = input ?? DEFAULT_CROSSHAIR_TOOLTIP_FIELDS;
  if (!Array.isArray(fields)) {
    throw new TypeError('crosshair.tooltipFields must be an array');
  }
  const seen = new Set<string>();
  return fields.map((field, index) => {
    if (!CROSSHAIR_TOOLTIP_FIELD_SET.has(field)) {
      throw new TypeError(
        `crosshair.tooltipFields[${index}] is not a supported tooltip field`
      );
    }
    if (seen.has(field)) {
      throw new TypeError(
        `crosshair.tooltipFields contains duplicate field '${field}'`
      );
    }
    seen.add(field);
    return field;
  });
}

function opacity(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${name} must be a finite number from 0 to 1`);
  }
  return value;
}

function color(value: string, name: string): string {
  if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) {
    throw new TypeError(`${name} must be #RRGGBB or #RRGGBBAA`);
  }
  return value;
}

function colorWithAlpha(value: string, alpha: string): string {
  return `${value.slice(0, 7)}${alpha}`;
}

function nonEmpty(value: string, name: string): string {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function identifier(value: string, name: string): string {
  const result = nonEmpty(value, name);
  if (!/^[A-Za-z0-9._-]+$/.test(result)) {
    throw new TypeError(
      `${name} may contain only letters, numbers, '.', '_' and '-'`
    );
  }
  return result;
}

function ohlcValueSource(
  value: OhlcValueSource | undefined,
  name: string
): OhlcValueSource {
  const result = value ?? 'close';
  if (
    result !== 'open' &&
    result !== 'high' &&
    result !== 'low' &&
    result !== 'close'
  ) {
    throw new TypeError(`${name} must be 'open', 'high', 'low' or 'close'`);
  }
  return result;
}

function lineStyle(value: string | undefined, name: string) {
  const result = value ?? 'solid';
  if (result !== 'solid' && result !== 'dashed') {
    throw new TypeError(`${name} must be 'solid' or 'dashed'`);
  }
  return result;
}

function optionalGapThreshold(value: number | undefined, name: string) {
  return value == null ? undefined : finitePositive(value, name);
}

function isResolutionUnit(value: string): value is ResolutionUnit {
  return RESOLUTION_UNITS.has(value);
}

function isChartSeriesType(value: string): value is ChartSeriesType {
  return CHART_SERIES_TYPES.has(value);
}

function validateAdditionalSeriesType(value: string, name: string): void {
  if (!ADDITIONAL_SERIES_TYPES.has(value)) {
    throw new TypeError(
      `${name}.type must be 'candlestick', 'hollowCandlestick', 'bar', 'line', 'area', 'baseline', 'histogram', 'boll', 'sar', 'kdj' or 'macd'`
    );
  }
}

function hasValidScaleMargins(value: { top: number; bottom: number }): boolean {
  if (!Number.isFinite(value.top) || value.top < 0) {
    return false;
  }
  if (!Number.isFinite(value.bottom) || value.bottom < 0) {
    return false;
  }
  return value.top + value.bottom <= 1 - MINIMUM_SCALE_CONTENT_FRACTION;
}

function hasValidOscillatorLevels(
  oversold: number,
  overbought: number,
  minimum: number
): boolean {
  if (!Number.isFinite(oversold) || oversold < minimum) {
    return false;
  }
  if (!Number.isFinite(overbought) || overbought > minimum + 100) {
    return false;
  }
  return oversold < overbought;
}

const WEEKDAY_NUMBER = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
} satisfies Record<TradingWeekday, number>;

function positiveSafeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeSafeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function resolveResolution(
  props: TradingChartsViewProps
): ResolvedChartResolution {
  const resolution = props.resolution ?? { unit: 'minute' as const };
  if (resolution.unit === 'fixed') {
    return {
      unit: 'fixed',
      durationMs: positiveSafeInteger(
        resolution.durationMs,
        'resolution.durationMs'
      ),
    };
  }
  if (!isResolutionUnit(resolution.unit)) {
    throw new TypeError(
      "resolution.unit must be 'fixed', 'second', 'minute', 'hour', 'day', 'week' or 'month'"
    );
  }
  const multiplier = positiveSafeInteger(
    resolution.multiplier ?? 1,
    'resolution.multiplier'
  );
  if (multiplier > INT32_MAX) {
    throw new TypeError('resolution.multiplier must be at most 2147483647');
  }
  return {
    unit: resolution.unit,
    multiplier,
  };
}

function parseClock(value: string, name: string): number {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (match == null) {
    throw new TypeError(`${name} must use HH:mm or HH:mm:ss`);
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new TypeError(`${name} is not a valid wall-clock time`);
  }
  return hour * 3600 + minute * 60 + second;
}

function validateDate(value: string, name: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match == null) {
    throw new TypeError(`${name} must use YYYY-MM-DD`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new TypeError(`${name} is not a valid calendar date`);
  }
  return value;
}

function validateTimeZone(value: string, name: string): string {
  const timeZone = nonEmpty(value, name);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
  } catch {
    throw new TypeError(`${name} must be a valid IANA time zone`);
  }
  return timeZone;
}

function resolveSessionSegment(
  segment: TradingSessionSegment,
  name: string
): ResolvedTradingSessionSegment {
  const startSeconds = parseClock(segment.start, `${name}.start`);
  const endSeconds = parseClock(segment.end, `${name}.end`);
  const startDayOffset = segment.startDayOffset ?? 0;
  const endDayOffset =
    segment.endDayOffset ?? (endSeconds <= startSeconds ? 1 : 0);
  if (startDayOffset !== -1 && startDayOffset !== 0) {
    throw new TypeError(`${name}.startDayOffset must be -1 or 0`);
  }
  if (endDayOffset !== 0 && endDayOffset !== 1) {
    throw new TypeError(`${name}.endDayOffset must be 0 or 1`);
  }
  if (
    endDayOffset * 86_400 + endSeconds <=
    startDayOffset * 86_400 + startSeconds
  ) {
    throw new TypeError(`${name} must end after it starts`);
  }
  return { startSeconds, endSeconds, startDayOffset, endDayOffset };
}

function resolveTradeAggregation(
  props: TradingChartsViewProps,
  resolution: ResolvedChartResolution
): ResolvedTradeAggregationOptions {
  const options = props.tradeAggregation;
  const rawOrigin = options?.bucketOrigin ?? 'epoch';
  const bucketOrigin =
    rawOrigin === 'epoch' || rawOrigin === 'session'
      ? { type: rawOrigin }
      : {
          type: 'timestamp' as const,
          timestamp: nonNegativeSafeInteger(
            rawOrigin.timestamp,
            'tradeAggregation.bucketOrigin.timestamp'
          ),
        };
  const outsideSession = options?.outsideSession ?? 'ignore';
  if (outsideSession !== 'ignore' && outsideSession !== 'reject') {
    throw new TypeError(
      "tradeAggregation.outsideSession must be 'ignore' or 'reject'"
    );
  }
  const candleTimestamp = options?.candleTimestamp ?? 'bucketStart';
  if (
    candleTimestamp !== 'bucketStart' &&
    candleTimestamp !== 'tradingDateUtc'
  ) {
    throw new TypeError(
      "tradeAggregation.candleTimestamp must be 'bucketStart' or 'tradingDateUtc'"
    );
  }
  const calendarUnit =
    resolution.unit === 'day' ||
    resolution.unit === 'week' ||
    resolution.unit === 'month';
  if (calendarUnit && bucketOrigin.type !== 'epoch') {
    throw new TypeError(
      'calendar resolutions currently require bucketOrigin epoch'
    );
  }
  if (!calendarUnit && candleTimestamp === 'tradingDateUtc') {
    throw new TypeError(
      'candleTimestamp tradingDateUtc requires day, week or month resolution'
    );
  }

  const calendar = options?.calendar;
  if (calendar == null) {
    return { bucketOrigin, outsideSession, candleTimestamp };
  }
  const timeZone = validateTimeZone(
    calendar.timeZone,
    'tradeAggregation.calendar.timeZone'
  );
  const sessions = (calendar.sessions ?? []).map((session, index) => {
    const name = `tradeAggregation.calendar.sessions[${index}]`;
    if (session.days.length === 0) {
      throw new TypeError(`${name}.days must not be empty`);
    }
    const weekdays = [
      ...new Set(
        session.days.map((day) => {
          const weekday = WEEKDAY_NUMBER[day];
          if (weekday == null) {
            throw new TypeError(`${name}.days contains an invalid weekday`);
          }
          return weekday;
        })
      ),
    ].sort((a, b) => a - b);
    return { ...resolveSessionSegment(session, name), weekdays };
  });
  const holidays = [
    ...new Set(
      (calendar.holidays ?? []).map((date, index) =>
        validateDate(date, `tradeAggregation.calendar.holidays[${index}]`)
      )
    ),
  ].sort();
  const seenOverrides = new Set<string>();
  const overrides = (calendar.overrides ?? [])
    .map((override, index) => {
      const name = `tradeAggregation.calendar.overrides[${index}]`;
      const date = validateDate(override.date, `${name}.date`);
      if (seenOverrides.has(date)) {
        throw new TypeError(`duplicate trading-calendar override for ${date}`);
      }
      seenOverrides.add(date);
      return {
        date,
        sessions: override.sessions.map((session, sessionIndex) =>
          resolveSessionSegment(session, `${name}.sessions[${sessionIndex}]`)
        ),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const weekStartsOn = calendar.weekStartsOn ?? 'monday';
  if (weekStartsOn !== 'monday' && weekStartsOn !== 'sunday') {
    throw new TypeError(
      "tradeAggregation.calendar.weekStartsOn must be 'monday' or 'sunday'"
    );
  }
  return {
    bucketOrigin,
    calendar: {
      timeZone,
      sessions,
      holidays,
      overrides,
      weekStartsOn,
    },
    outsideSession,
    candleTimestamp,
  };
}

function resolveScaleMargins(
  value: ChartPaneOptions['priceScale']['scaleMargins'] | undefined,
  fallback: { top: number; bottom: number },
  name: string
) {
  const result = value ?? fallback;
  if (!hasValidScaleMargins(result)) {
    throw new TypeError(
      `${name} must be finite, non-negative and leave at least ${MINIMUM_SCALE_CONTENT_FRACTION} of the price scale`
    );
  }
  return { top: result.top, bottom: result.bottom };
}

function resolveVolumeFormat(
  value: VolumeValueFormat | undefined
): Required<VolumeValueFormat> {
  const precision = value?.precision ?? 2;
  if (!Number.isInteger(precision) || precision < 0 || precision > 12) {
    throw new TypeError(
      'panes[].priceScale.valueFormat.precision must be an integer from 0 to 12'
    );
  }
  return {
    type: 'volume',
    precision,
    locale: nonEmpty(
      value?.locale ?? 'en-GB',
      'panes[].priceScale.valueFormat.locale'
    ),
    useGrouping: value?.useGrouping ?? true,
  };
}

function resolveTextStyle(
  input: ChartTextStyle | undefined,
  fallbackColor: string,
  name: string
): ResolvedChartTextStyle {
  const result: ResolvedChartTextStyle = {
    color: color(input?.color ?? fallbackColor, `${name}.color`),
  };
  if (input?.fontFamily !== undefined) {
    result.fontFamily = nonEmpty(input.fontFamily, `${name}.fontFamily`);
  }
  if (input?.fontSize !== undefined) {
    result.fontSize = finitePositive(input.fontSize, `${name}.fontSize`);
  }
  if (input?.fontWeight !== undefined) {
    if (
      input.fontWeight !== 'regular' &&
      input.fontWeight !== 'medium' &&
      input.fontWeight !== 'semibold' &&
      input.fontWeight !== 'bold'
    ) {
      throw new TypeError(`${name}.fontWeight is invalid`);
    }
    result.fontWeight = input.fontWeight;
  }
  return result;
}

function resolveBorder(
  input: ChartBorderStyle | undefined,
  defaultRadius: number,
  name: string
) {
  return {
    color: color(input?.color ?? '#00000000', `${name}.color`),
    width: finiteNonNegative(input?.width ?? 0, `${name}.width`),
    radius: finiteNonNegative(input?.radius ?? defaultRadius, `${name}.radius`),
  };
}

function resolveValueFormat(input?: YAxisValueFormat) {
  if (input?.type === 'significant') {
    const format: Required<SignificantValueFormat> = {
      type: 'significant',
      significantDigits: input.significantDigits ?? 3,
      minMove: input.minMove ?? 0.01,
      locale: input.locale ?? 'en-GB',
      currencySymbol: input.currencySymbol ?? '',
      useGrouping: input.useGrouping ?? true,
    };
    if (
      !Number.isInteger(format.significantDigits) ||
      format.significantDigits < 1 ||
      format.significantDigits > 8
    ) {
      throw new TypeError(
        'yAxis.valueFormat.significantDigits must be an integer from 1 to 8'
      );
    }
    finitePositive(format.minMove, 'yAxis.valueFormat.minMove');
    return format;
  }

  if (input?.type === 'compact') {
    const format: Required<CompactValueFormat> = {
      type: 'compact',
      precision: input.precision ?? 2,
      minMove: input.minMove ?? 0.01,
      locale: input.locale ?? 'en-GB',
      currencySymbol: input.currencySymbol ?? '',
    };
    if (
      !Number.isInteger(format.precision) ||
      format.precision < 0 ||
      format.precision > 8
    ) {
      throw new TypeError(
        'yAxis.valueFormat.precision must be an integer from 0 to 8'
      );
    }
    finitePositive(format.minMove, 'yAxis.valueFormat.minMove');
    return format;
  }

  const price = input;
  const format: Required<PriceValueFormat> = {
    type: 'price',
    precision: price?.precision ?? 2,
    minMove: price?.minMove ?? 0.01,
    locale: price?.locale ?? 'en-GB',
    currencySymbol: price?.currencySymbol ?? '',
    useGrouping: price?.useGrouping ?? true,
  };
  if (
    !Number.isInteger(format.precision) ||
    format.precision < 0 ||
    format.precision > 12
  ) {
    throw new TypeError(
      'yAxis.valueFormat.precision must be an integer from 0 to 12'
    );
  }
  finitePositive(format.minMove, 'yAxis.valueFormat.minMove');
  return format;
}

function resolveDisplayFormat(
  input: PriceDisplayFormat | undefined,
  fallback: ReturnType<typeof resolveValueFormat>,
  name: string
): ResolvedPriceDisplayFormat {
  const type = input?.type ?? fallback.type;
  if (type === 'significant') {
    const significantDigits =
      (input?.type === 'significant' ? input.significantDigits : undefined) ??
      (fallback.type === 'significant' ? fallback.significantDigits : 3);
    if (
      !Number.isInteger(significantDigits) ||
      significantDigits < 1 ||
      significantDigits > 8
    ) {
      throw new TypeError(
        `${name}.significantDigits must be an integer from 1 to 8`
      );
    }
    return {
      type,
      significantDigits,
      locale: nonEmpty(input?.locale ?? fallback.locale, `${name}.locale`),
      currencySymbol: input?.currencySymbol ?? fallback.currencySymbol,
      useGrouping:
        input?.useGrouping ??
        ('useGrouping' in fallback ? fallback.useGrouping : true),
    };
  }

  const precision =
    (input?.type !== 'significant' ? input?.precision : undefined) ??
    ('precision' in fallback ? fallback.precision : 2);
  const maximumPrecision = type === 'compact' ? 8 : 12;
  if (
    !Number.isInteger(precision) ||
    precision < 0 ||
    precision > maximumPrecision
  ) {
    throw new TypeError(
      `${name}.precision must be an integer from 0 to ${maximumPrecision}`
    );
  }
  return {
    type,
    precision,
    locale: nonEmpty(input?.locale ?? fallback.locale, `${name}.locale`),
    currencySymbol: input?.currencySymbol ?? fallback.currencySymbol,
    useGrouping:
      input?.useGrouping ??
      ('useGrouping' in fallback ? fallback.useGrouping : true),
  };
}

function resolvePulseDot(
  appearance: ChartAppearance | undefined,
  seriesType: ChartSeriesType,
  strokeColor: string,
  belowBaseColor: string
): ResolvedChartAppearance['pulseDot'] {
  const supported =
    seriesType === 'line' || seriesType === 'area' || seriesType === 'baseline';
  const options = supported ? appearance?.[seriesType]?.pulseDot : undefined;
  const path = `appearance.${seriesType}.pulseDot`;
  const pulse: ResolvedChartAppearance['pulseDot'] = {
    enabled: options?.enabled ?? false,
    color: color(options?.color ?? strokeColor, `${path}.color`),
    frequency: finitePositive(
      options?.frequency ?? 1 / 1.2,
      `${path}.frequency`
    ),
    radius: finitePositive(options?.radius ?? 4, `${path}.radius`),
    haloRadius: finitePositive(options?.haloRadius ?? 14, `${path}.haloRadius`),
  };
  if (seriesType === 'baseline')
    pulse.belowBaseColor =
      options?.color == null ? belowBaseColor : pulse.color;
  return pulse;
}

function resolveAppearance(
  input: ChartAppearance | undefined,
  theme: Required<ChartTheme>,
  legacyTooltipOpacity: number,
  seriesType: ChartSeriesType
): ResolvedChartAppearance {
  const backgroundColor = color(
    input?.backgroundColor ?? theme.backgroundColor,
    'appearance.backgroundColor'
  );
  const gridColor = color(
    input?.grid?.color ?? theme.gridColor,
    'appearance.grid.color'
  );
  const upColor = color(
    input?.candles?.upColor ?? theme.upColor,
    'appearance.candles.upColor'
  );
  const downColor = color(
    input?.candles?.downColor ?? theme.downColor,
    'appearance.candles.downColor'
  );
  const barUpColor = color(
    input?.bars?.upColor ?? upColor,
    'appearance.bars.upColor'
  );
  const barDownColor = color(
    input?.bars?.downColor ?? downColor,
    'appearance.bars.downColor'
  );
  const barLineWidth = finitePositive(
    input?.bars?.lineWidth ?? 1,
    'appearance.bars.lineWidth'
  );
  const lineWidth = finitePositive(
    input?.line?.width ?? 1.5,
    'appearance.line.width'
  );
  const lineColor = color(
    input?.line?.color ?? theme.upColor,
    'appearance.line.color'
  );
  const resolvedLineStyle = lineStyle(
    input?.line?.style,
    'appearance.line.style'
  );
  const lineGradient = input?.line?.gradient;
  const resolvedLineGradient =
    lineGradient == null
      ? undefined
      : {
          topColor: color(
            lineGradient.topColor,
            'appearance.line.gradient.topColor'
          ),
          bottomColor: color(
            lineGradient.bottomColor,
            'appearance.line.gradient.bottomColor'
          ),
        };
  const areaWidth = finitePositive(
    input?.area?.width ?? 1.5,
    'appearance.area.width'
  );
  const areaColor = color(
    input?.area?.color ?? theme.upColor,
    'appearance.area.color'
  );
  const resolvedAreaStyle = lineStyle(
    input?.area?.style,
    'appearance.area.style'
  );
  const areaGradient = input?.area?.gradient;
  const resolvedAreaGradient =
    areaGradient == null
      ? undefined
      : {
          topColor: color(
            areaGradient.topColor,
            'appearance.area.gradient.topColor'
          ),
          bottomColor: color(
            areaGradient.bottomColor,
            'appearance.area.gradient.bottomColor'
          ),
        };
  const areaFill = {
    topColor: color(
      input?.area?.fill?.topColor ?? colorWithAlpha(areaColor, '40'),
      'appearance.area.fill.topColor'
    ),
    bottomColor: color(
      input?.area?.fill?.bottomColor ?? colorWithAlpha(areaColor, '00'),
      'appearance.area.fill.bottomColor'
    ),
  };
  const baseline = resolveBaselineAppearance(input?.baseline, theme);
  let activeUpColor = upColor;
  let activeDownColor = downColor;
  if (seriesType === 'baseline') {
    activeUpColor = baseline.topLineColor;
    activeDownColor = baseline.bottomLineColor;
  } else if (seriesType === 'bar') {
    activeUpColor = barUpColor;
    activeDownColor = barDownColor;
  } else if (seriesType === 'line' || seriesType === 'area') {
    const activeColor = seriesType === 'area' ? areaColor : lineColor;
    activeUpColor = activeColor;
    activeDownColor = activeColor;
  }
  const axisColor = color(theme.axisTextColor, 'theme.axisTextColor');
  const crosshairColor = color(
    input?.crosshair?.line?.color ?? theme.crosshairColor,
    'appearance.crosshair.line.color'
  );
  const tooltipTextColor = color(
    theme.tooltipTextColor,
    'theme.tooltipTextColor'
  );
  const badgeFallback = '#000000';

  return {
    pulseDot: resolvePulseDot(
      input,
      seriesType,
      activeUpColor,
      activeDownColor
    ),
    baseline: { ...baseline, rounded: input?.baseline?.rounded ?? true },
    backgroundColor,
    grid: {
      color: gridColor,
      opacity: opacity(input?.grid?.opacity ?? 0.75, 'appearance.grid.opacity'),
    },
    candles: {
      upColor,
      downColor,
      radius: finiteNonNegative(
        input?.candles?.radius ?? 0,
        'appearance.candles.radius'
      ),
    },
    bars: {
      upColor: barUpColor,
      downColor: barDownColor,
      lineWidth: barLineWidth,
    },
    line: {
      width: lineWidth,
      color: lineColor,
      style: resolvedLineStyle,
      rounded: input?.line?.rounded ?? true,
      ...(resolvedLineGradient == null
        ? null
        : { gradient: resolvedLineGradient }),
    },
    area: {
      width: areaWidth,
      color: areaColor,
      style: resolvedAreaStyle,
      rounded: input?.area?.rounded ?? true,
      ...(resolvedAreaGradient == null
        ? null
        : { gradient: resolvedAreaGradient }),
      fill: areaFill,
    },
    xAxis: {
      text: resolveTextStyle(
        input?.xAxis?.text,
        axisColor,
        'appearance.xAxis.text'
      ),
    },
    yAxis: {
      text: resolveTextStyle(
        input?.yAxis?.text,
        axisColor,
        'appearance.yAxis.text'
      ),
    },
    priceExtremes: {
      text: resolveTextStyle(
        input?.priceExtremes?.text,
        axisColor,
        'appearance.priceExtremes.text'
      ),
      connectorColor: color(
        input?.priceExtremes?.connectorColor ?? axisColor,
        'appearance.priceExtremes.connectorColor'
      ),
      backgroundColor: color(
        input?.priceExtremes?.backgroundColor ?? backgroundColor,
        'appearance.priceExtremes.backgroundColor'
      ),
    },
    currentPrice: {
      line: {
        upColor: color(
          input?.currentPrice?.line?.upColor ?? activeUpColor,
          'appearance.currentPrice.line.upColor'
        ),
        downColor: color(
          input?.currentPrice?.line?.downColor ?? activeDownColor,
          'appearance.currentPrice.line.downColor'
        ),
      },
      label: {
        upBackgroundColor: color(
          input?.currentPrice?.label?.upBackgroundColor ?? activeUpColor,
          'appearance.currentPrice.label.upBackgroundColor'
        ),
        downBackgroundColor: color(
          input?.currentPrice?.label?.downBackgroundColor ?? activeDownColor,
          'appearance.currentPrice.label.downBackgroundColor'
        ),
        text: resolveTextStyle(
          input?.currentPrice?.label?.text,
          badgeFallback,
          'appearance.currentPrice.label.text'
        ),
        border: resolveBorder(
          input?.currentPrice?.label?.border,
          4,
          'appearance.currentPrice.label.border'
        ),
      },
    },
    priceLines: {
      label: {
        border: {
          radius: finiteNonNegative(
            input?.priceLines?.label?.border?.radius ?? 0,
            'appearance.priceLines.label.border.radius'
          ),
        },
      },
    },
    crosshair: {
      line: {
        color: crosshairColor,
        opacity: opacity(
          input?.crosshair?.line?.opacity ?? 0.85,
          'appearance.crosshair.line.opacity'
        ),
      },
      priceLabel: {
        backgroundColor: color(
          input?.crosshair?.priceLabel?.backgroundColor ?? crosshairColor,
          'appearance.crosshair.priceLabel.backgroundColor'
        ),
        text: resolveTextStyle(
          input?.crosshair?.priceLabel?.text,
          badgeFallback,
          'appearance.crosshair.priceLabel.text'
        ),
        border: resolveBorder(
          input?.crosshair?.priceLabel?.border,
          4,
          'appearance.crosshair.priceLabel.border'
        ),
      },
      timeLabel: {
        backgroundColor: color(
          input?.crosshair?.timeLabel?.backgroundColor ?? crosshairColor,
          'appearance.crosshair.timeLabel.backgroundColor'
        ),
        text: resolveTextStyle(
          input?.crosshair?.timeLabel?.text,
          badgeFallback,
          'appearance.crosshair.timeLabel.text'
        ),
        border: resolveBorder(
          input?.crosshair?.timeLabel?.border,
          4,
          'appearance.crosshair.timeLabel.border'
        ),
      },
    },
    tooltip: {
      backgroundColor: color(
        input?.tooltip?.backgroundColor ?? theme.tooltipBackgroundColor,
        'appearance.tooltip.backgroundColor'
      ),
      backgroundOpacity: opacity(
        input?.tooltip?.backgroundOpacity ?? legacyTooltipOpacity,
        'appearance.tooltip.backgroundOpacity'
      ),
      headerText: resolveTextStyle(
        input?.tooltip?.headerText,
        tooltipTextColor,
        'appearance.tooltip.headerText'
      ),
      labelText: resolveTextStyle(
        input?.tooltip?.labelText,
        tooltipTextColor,
        'appearance.tooltip.labelText'
      ),
      valueText: resolveTextStyle(
        input?.tooltip?.valueText,
        tooltipTextColor,
        'appearance.tooltip.valueText'
      ),
      positiveValueColor: color(
        input?.tooltip?.positiveValueColor ?? activeUpColor,
        'appearance.tooltip.positiveValueColor'
      ),
      negativeValueColor: color(
        input?.tooltip?.negativeValueColor ?? activeDownColor,
        'appearance.tooltip.negativeValueColor'
      ),
      border: resolveBorder(
        input?.tooltip?.border,
        8,
        'appearance.tooltip.border'
      ),
    },
  };
}

function resolveFormatters(
  input: ChartFormatters | undefined,
  xAxis: { locale?: string; timeZone?: string },
  yAxisValueFormat: ReturnType<typeof resolveValueFormat>
): ResolvedChartFormatters {
  const xInput = input?.date?.xAxis;
  const xLocale = nonEmpty(
    xInput?.locale ?? xAxis.locale ?? 'en-GB',
    'formatters.date.xAxis.locale'
  );
  const xTimeZone = nonEmpty(
    xInput?.timeZone ?? xAxis.timeZone ?? 'UTC',
    'formatters.date.xAxis.timeZone'
  );
  const pattern = (value: string | undefined, fallback: string, name: string) =>
    nonEmpty(value ?? fallback, name);
  const datePattern = (
    value: { pattern: string; locale?: string; timeZone?: string } | undefined,
    fallbackPattern: string,
    name: string
  ) => ({
    pattern: pattern(value?.pattern, fallbackPattern, `${name}.pattern`),
    locale: nonEmpty(value?.locale ?? xLocale, `${name}.locale`),
    timeZone: nonEmpty(value?.timeZone ?? xTimeZone, `${name}.timeZone`),
  });

  return {
    date: {
      xAxis: {
        locale: xLocale,
        timeZone: xTimeZone,
        seconds: pattern(
          xInput?.seconds,
          'HH:mm:ss',
          'formatters.date.xAxis.seconds'
        ),
        time: pattern(xInput?.time, 'HH:mm', 'formatters.date.xAxis.time'),
        day: pattern(xInput?.day, 'd MMM', 'formatters.date.xAxis.day'),
        month: pattern(
          xInput?.month,
          'MMM yyyy',
          'formatters.date.xAxis.month'
        ),
        year: pattern(xInput?.year, 'yyyy', 'formatters.date.xAxis.year'),
      },
      crosshairTimeBadge: datePattern(
        input?.date?.crosshairTimeBadge,
        'd MMM yyyy HH:mm:ss',
        'formatters.date.crosshairTimeBadge'
      ),
      tooltipHeader: datePattern(
        input?.date?.tooltipHeader,
        'd MMM yyyy HH:mm:ss',
        'formatters.date.tooltipHeader'
      ),
    },
    price: {
      yAxis: yAxisValueFormat,
      priceExtremes: resolveDisplayFormat(
        input?.price?.priceExtremes,
        yAxisValueFormat,
        'formatters.price.priceExtremes'
      ),
      currentPrice: resolveDisplayFormat(
        input?.price?.currentPrice,
        yAxisValueFormat,
        'formatters.price.currentPrice'
      ),
      crosshairPrice: resolveDisplayFormat(
        input?.price?.crosshairPrice,
        yAxisValueFormat,
        'formatters.price.crosshairPrice'
      ),
      tooltip: resolveDisplayFormat(
        input?.price?.tooltip,
        yAxisValueFormat,
        'formatters.price.tooltip'
      ),
    },
  };
}

type NormalizedSeriesBase = {
  visible: boolean;
  seriesId: string;
  paneId: string;
  priceScaleId: string;
};

type AdditionalPriceSeriesOptions =
  | Extract<AdditionalOhlcSeriesOptions, { type: 'line' }>
  | Extract<AdditionalOhlcSeriesOptions, { type: 'area' }>;

type NormalizedMovingAverageSeriesOptions = Extract<
  NormalizedAdditionalChartSeriesOptions,
  { source: { type: 'ohlcvSma' | 'ohlcvEma' } }
>;

type NormalizedFixedOscillator = Extract<
  NormalizedAdditionalChartSeriesOptions,
  { source: { type: 'ohlcvRsi' | 'ohlcvWilliamsR' } }
>;

type NormalizedMacdSeriesOptions = Extract<
  NormalizedAdditionalChartSeriesOptions,
  { source: { type: 'ohlcvMacd' } }
>;

function isFixedOscillator(
  options: NormalizedAdditionalChartSeriesOptions
): options is NormalizedFixedOscillator;
function isFixedOscillator(
  options: AdditionalChartSeriesOptions
): options is RsiSeriesOptions | WilliamsRSeriesOptions;
function isFixedOscillator(
  options: AdditionalChartSeriesOptions | NormalizedAdditionalChartSeriesOptions
): boolean {
  if (options.type !== 'line') {
    return false;
  }
  const source = options.source;
  if (source == null) {
    return false;
  }
  if (
    source === 'open' ||
    source === 'high' ||
    source === 'low' ||
    source === 'close'
  ) {
    return false;
  }
  return source.type === 'ohlcvRsi' || source.type === 'ohlcvWilliamsR';
}

function isMovingAverageSeriesOptions(
  options: NormalizedAdditionalChartSeriesOptions
): options is NormalizedMovingAverageSeriesOptions;
function isMovingAverageSeriesOptions(
  options: AdditionalChartSeriesOptions
): options is MovingAverageSeriesOptions;
function isMovingAverageSeriesOptions(
  options: AdditionalChartSeriesOptions | NormalizedAdditionalChartSeriesOptions
): boolean {
  if (options.type !== 'line') {
    return false;
  }
  const source = options.source;
  if (source == null) {
    return false;
  }
  switch (source) {
    case 'open':
    case 'high':
    case 'low':
    case 'close':
      return false;
    default:
      return source.type === 'ohlcvSma' || source.type === 'ohlcvEma';
  }
}

function resolveSeriesBase(
  options: AdditionalChartSeriesOptions,
  name: string
): NormalizedSeriesBase {
  const seriesId = identifier(options.seriesId, `${name}.seriesId`);
  if (seriesId === 'main') {
    throw new TypeError(`${name}.seriesId 'main' is reserved`);
  }
  return {
    seriesId,
    paneId: identifier(options.paneId, `${name}.paneId`),
    priceScaleId: identifier(options.priceScaleId, `${name}.priceScaleId`),
    visible: options.visible ?? true,
  };
}

type ResolvedGapThreshold = { gapThresholdMs?: number };

function resolveGapThreshold(
  value: number | undefined,
  name: string
): ResolvedGapThreshold {
  if (value == null) {
    return {};
  }
  return { gapThresholdMs: optionalGapThreshold(value, name) };
}

function validateLineAppearance(
  options:
    | AdditionalPriceSeriesOptions
    | MovingAverageSeriesOptions
    | RsiSeriesOptions
    | WilliamsRSeriesOptions,
  name: string
): void {
  const appearance = options.appearance;
  validateChartLineAppearance(appearance, `${name}.appearance`);
  if (options.type !== 'area') {
    return;
  }
  const fill = options.appearance?.fill;
  if (fill == null) {
    return;
  }
  if (fill.topColor != null) {
    color(fill.topColor, `${name}.appearance.fill.topColor`);
  }
  if (fill.bottomColor != null) {
    color(fill.bottomColor, `${name}.appearance.fill.bottomColor`);
  }
}

function validateChartLineAppearance(
  appearance:
    | {
        width?: number;
        color?: string;
        style?: 'solid' | 'dashed';
        gradient?: { topColor: string; bottomColor: string };
      }
    | undefined,
  name: string
): void {
  if (appearance?.width != null) {
    finitePositive(appearance.width, `${name}.width`);
  }
  if (appearance?.color != null) {
    color(appearance.color, `${name}.color`);
  }
  if (appearance?.style != null) {
    lineStyle(appearance.style, `${name}.style`);
  }
  if (appearance?.gradient != null) {
    color(appearance.gradient.topColor, `${name}.gradient.topColor`);
    color(appearance.gradient.bottomColor, `${name}.gradient.bottomColor`);
  }
}

function resolvePriceSeriesOptions(
  options: AdditionalPriceSeriesOptions,
  name: string,
  base: NormalizedSeriesBase
): NormalizedAdditionalChartSeriesOptions {
  validateLineAppearance(options, name);
  return {
    ...options,
    ...base,
    source: ohlcValueSource(options.source, `${name}.source`),
    ...resolveGapThreshold(options.gapThresholdMs, `${name}.gapThresholdMs`),
  };
}

function validateOscillatorAppearance(
  options: RsiSeriesOptions | WilliamsRSeriesOptions,
  name: string
): void {
  validateLineAppearance(options, name);
  const appearance = options.appearance;
  for (const [key, value] of [
    ['color', appearance?.color],
    ['textColor', appearance?.textColor],
    ['levelLineColor', appearance?.levelLineColor],
    ['bandColor', appearance?.bandColor],
  ] as const) {
    if (value != null) {
      color(value, `${name}.appearance.${key}`);
    }
  }
}

function resolveLegendVisible(
  visible: boolean | undefined,
  name: string
): boolean {
  if (visible == null) return true;
  if (visible !== true && visible !== false) {
    throw new TypeError(`${name}.legendVisible must be a boolean`);
  }
  return visible;
}

function resolveMovingAverageSeriesOptions(
  options: MovingAverageSeriesOptions,
  name: string,
  base: NormalizedSeriesBase
): NormalizedAdditionalChartSeriesOptions {
  const sourceSeriesId = identifier(
    options.source.seriesId,
    `${name}.source.seriesId`
  );
  const period = options.source.period;
  if (!Number.isInteger(period) || period < 1 || period > UINT32_MAX) {
    throw new TypeError(
      `${name}.source.period must be an integer from 1 to ${UINT32_MAX}`
    );
  }
  validateLineAppearance(options, name);
  return {
    ...options,
    legendVisible: resolveLegendVisible(options.legendVisible, name),
    ...base,
    source: {
      ...options.source,
      seriesId: sourceSeriesId,
      period,
      valueSource: ohlcValueSource(
        options.source.valueSource,
        `${name}.source.valueSource`
      ),
    },
    ...resolveGapThreshold(options.gapThresholdMs, `${name}.gapThresholdMs`),
  };
}

function resolveFixedOscillator(
  options: RsiSeriesOptions | WilliamsRSeriesOptions,
  name: string,
  base: NormalizedSeriesBase
): NormalizedAdditionalChartSeriesOptions {
  const williams = options.source.type === 'ohlcvWilliamsR';
  if (base.paneId === 'main') {
    throw new TypeError(
      `${name}.paneId must reference a separate ${williams ? 'Williams %R' : 'RSI'} pane`
    );
  }
  const sourceSeriesId = identifier(
    options.source.seriesId,
    `${name}.source.seriesId`
  );
  const period = options.source.period ?? 14;
  if (!Number.isInteger(period) || period <= 0 || period > UINT32_MAX) {
    throw new TypeError(`${name}.source.period must be a positive integer`);
  }
  const oversold = options.levels?.oversold ?? (williams ? -80 : 30);
  const overbought = options.levels?.overbought ?? (williams ? -20 : 70);
  const minimum = williams ? -100 : 0;
  if (!hasValidOscillatorLevels(oversold, overbought, minimum)) {
    throw new TypeError(
      `${name}.levels must satisfy ${minimum} <= oversold < overbought <= ${minimum + 100}`
    );
  }
  validateOscillatorAppearance(options, name);
  const common = {
    ...options,
    legendVisible: resolveLegendVisible(options.legendVisible, name),
    ...base,
    levels: { oversold, overbought },
    ...resolveGapThreshold(options.gapThresholdMs, `${name}.gapThresholdMs`),
  };
  const source = { seriesId: sourceSeriesId, period };
  if (williams)
    return { ...common, source: { ...source, type: 'ohlcvWilliamsR' } };
  return { ...common, source: { ...source, type: 'ohlcvRsi' } };
}

function resolveSarSeriesOptions(
  options: SarSeriesOptions,
  name: string,
  base: NormalizedSeriesBase
): NormalizedSarSeriesOptions {
  if (options.source.type !== 'ohlcvSar') {
    throw new TypeError(`${name}.source.type must be 'ohlcvSar'`);
  }
  const step = finitePositive(
    options.source.step ?? 0.02,
    `${name}.source.step`
  );
  const maximum = finitePositive(
    options.source.maximum ?? 0.2,
    `${name}.source.maximum`
  );
  if (step > maximum || maximum > 1) {
    throw new TypeError(`${name}.source must satisfy 0 < step <= maximum <= 1`);
  }
  return {
    ...base,
    type: 'sar',
    source: {
      type: 'ohlcvSar',
      seriesId: identifier(options.source.seriesId, `${name}.source.seriesId`),
      step,
      maximum,
    },
    appearance: {
      upColor: color(
        options.appearance?.upColor ?? DEFAULT_THEME.upColor,
        `${name}.appearance.upColor`
      ),
      downColor: color(
        options.appearance?.downColor ?? DEFAULT_THEME.downColor,
        `${name}.appearance.downColor`
      ),
      reversalColor: color(
        options.appearance?.reversalColor ?? DEFAULT_THEME.axisTextColor,
        `${name}.appearance.reversalColor`
      ),
    },
  };
}

function resolveBollSeriesOptions(
  options: BollSeriesOptions,
  name: string,
  base: NormalizedSeriesBase
): NormalizedBollSeriesOptions {
  const period = options.source.period ?? 20;
  if (!Number.isInteger(period) || period < 1 || period > UINT32_MAX) {
    throw new TypeError(
      `${name}.source.period must be an integer from 1 to ${UINT32_MAX}`
    );
  }
  if (options.source.type !== 'ohlcvBoll') {
    throw new TypeError(`${name}.source.type must be 'ohlcvBoll'`);
  }
  for (const key of ['upperLine', 'middleLine', 'lowerLine'] as const) {
    validateChartLineAppearance(
      options.appearance?.[key],
      `${name}.appearance.${key}`
    );
  }
  const fill = options.appearance?.fill;
  for (const key of ['topColor', 'bottomColor'] as const) {
    if (fill?.[key] != null) color(fill[key], `${name}.appearance.fill.${key}`);
  }
  if (
    fill?.enabled != null &&
    fill.enabled !== true &&
    fill.enabled !== false
  ) {
    throw new TypeError(`${name}.appearance.fill.enabled must be a boolean`);
  }
  return {
    ...options,
    legendVisible: resolveLegendVisible(options.legendVisible, name),
    ...base,
    source: {
      type: 'ohlcvBoll',
      seriesId: identifier(options.source.seriesId, `${name}.source.seriesId`),
      period,
      stdDevMultiplier: finitePositive(
        options.source.stdDevMultiplier ?? 2,
        `${name}.source.stdDevMultiplier`
      ),
      valueSource: ohlcValueSource(
        options.source.valueSource,
        `${name}.source.valueSource`
      ),
    },
    ...resolveGapThreshold(options.gapThresholdMs, `${name}.gapThresholdMs`),
  };
}

function resolveKdjSeriesOptions(
  options: KdjSeriesOptions,
  name: string,
  base: NormalizedSeriesBase
): NormalizedKdjSeriesOptions {
  if (base.paneId === 'main')
    throw new TypeError(`${name}.paneId must reference a separate KDJ pane`);
  if (options.source?.type !== 'ohlcvKdj')
    throw new TypeError(`${name}.source.type must be 'ohlcvKdj'`);
  const { period = 9, m1 = 3, m2 = 3 } = options.source;
  for (const [key, value] of Object.entries({ period, m1, m2 })) {
    if (!Number.isInteger(value) || value < 1 || value > UINT32_MAX)
      throw new TypeError(
        `${name}.source.${key} must be an integer from 1 to ${UINT32_MAX}`
      );
  }
  for (const key of ['kLine', 'dLine', 'jLine'] as const) {
    validateChartLineAppearance(
      options.appearance?.[key],
      `${name}.appearance.${key}`
    );
  }
  return {
    ...options,
    legendVisible: resolveLegendVisible(options.legendVisible, name),
    ...base,
    source: {
      type: 'ohlcvKdj',
      seriesId: identifier(options.source.seriesId, `${name}.source.seriesId`),
      period,
      m1,
      m2,
    },
    ...resolveGapThreshold(options.gapThresholdMs, `${name}.gapThresholdMs`),
  };
}

function resolveMacdSeriesOptions(
  options: MacdSeriesOptions,
  name: string,
  base: NormalizedSeriesBase
): NormalizedAdditionalChartSeriesOptions {
  if (base.paneId === 'main') {
    throw new TypeError(`${name}.paneId must reference a separate MACD pane`);
  }
  if (options.source?.type !== 'ohlcvMacd') {
    throw new TypeError(`${name}.source.type must be 'ohlcvMacd'`);
  }
  const sourceSeriesId = identifier(
    options.source.seriesId,
    `${name}.source.seriesId`
  );
  const fastPeriod = options.source.fastPeriod ?? 12;
  const slowPeriod = options.source.slowPeriod ?? 26;
  const signalPeriod = options.source.signalPeriod ?? 9;
  for (const [key, value] of [
    ['fastPeriod', fastPeriod],
    ['slowPeriod', slowPeriod],
    ['signalPeriod', signalPeriod],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > UINT32_MAX) {
      throw new TypeError(
        `${name}.source.${key} must be an integer from 1 to ${UINT32_MAX}`
      );
    }
  }
  if (fastPeriod >= slowPeriod) {
    throw new TypeError(
      `${name}.source.fastPeriod must be less than slowPeriod`
    );
  }
  validateChartLineAppearance(
    options.appearance?.macdLine,
    `${name}.appearance.macdLine`
  );
  validateChartLineAppearance(
    options.appearance?.signalLine,
    `${name}.appearance.signalLine`
  );
  const histogram = options.appearance?.histogram;
  for (const [key, value] of [
    ['positiveIncreasingColor', histogram?.positiveIncreasingColor],
    ['positiveDecreasingColor', histogram?.positiveDecreasingColor],
    ['negativeIncreasingColor', histogram?.negativeIncreasingColor],
    ['negativeDecreasingColor', histogram?.negativeDecreasingColor],
    ['textColor', options.appearance?.textColor],
    ['zeroLineColor', options.appearance?.zeroLineColor],
  ] as const) {
    if (value != null) {
      color(value, `${name}.appearance.${key}`);
    }
  }
  return {
    ...options,
    legendVisible: resolveLegendVisible(options.legendVisible, name),
    ...base,
    source: {
      type: 'ohlcvMacd',
      seriesId: sourceSeriesId,
      fastPeriod,
      slowPeriod,
      signalPeriod,
      valueSource: ohlcValueSource(
        options.source.valueSource,
        `${name}.source.valueSource`
      ),
    },
    ...resolveGapThreshold(options.gapThresholdMs, `${name}.gapThresholdMs`),
  };
}

function resolveHistogramSeriesOptions(
  options: HistogramSeriesOptions,
  name: string,
  base: NormalizedSeriesBase
): NormalizedAdditionalChartSeriesOptions {
  const source = options.source ?? { type: 'data' as const };
  if (source.type === 'ohlcvVolume') {
    identifier(source.seriesId, `${name}.source.seriesId`);
  }
  const appearance = options.appearance;
  if (appearance?.color != null) {
    color(appearance.color, `${name}.appearance.color`);
  }
  if (appearance?.upColor != null) {
    color(appearance.upColor, `${name}.appearance.upColor`);
  }
  if (appearance?.downColor != null) {
    color(appearance.downColor, `${name}.appearance.downColor`);
  }
  return {
    ...options,
    ...base,
    ...(source.type === 'ohlcvVolume' && {
      legendVisible: resolveLegendVisible(options.legendVisible, name),
    }),
    source,
  };
}

/** Normalizes one series before imperative dispatch or chart-level resolution. */
export function resolveAdditionalSeriesOptions(
  options: AdditionalChartSeriesOptions,
  name = 'options'
): NormalizedAdditionalChartSeriesOptions {
  const base = resolveSeriesBase(options, name);
  validateAdditionalSeriesType(options.type, name);
  if (options.type === 'sar')
    return resolveSarSeriesOptions(options, name, base);
  if (options.type === 'kdj')
    return resolveKdjSeriesOptions(options, name, base);
  if (options.type === 'boll')
    return resolveBollSeriesOptions(options, name, base);
  if (options.type === 'macd') {
    return resolveMacdSeriesOptions(options, name, base);
  }
  if (isFixedOscillator(options)) {
    return resolveFixedOscillator(options, name, base);
  }
  if (isMovingAverageSeriesOptions(options)) {
    return resolveMovingAverageSeriesOptions(options, name, base);
  }
  if (options.type === 'baseline') {
    if (options.appearance != null)
      resolveBaselineAppearance(options.appearance, DEFAULT_THEME);
    return {
      ...options,
      ...base,
      source: ohlcValueSource(options.source, `${name}.source`),
      baseValue: resolveBaseValue(options.baseValue),
      ...resolveGapThreshold(options.gapThresholdMs, `${name}.gapThresholdMs`),
    };
  }
  if (options.type === 'histogram') {
    return resolveHistogramSeriesOptions(options, name, base);
  }
  if (options.type === 'line' || options.type === 'area') {
    return resolvePriceSeriesOptions(options, name, base);
  }
  return {
    ...options,
    ...base,
  };
}

type AdditionalSeriesResolutionContext = {
  panes: ReadonlyArray<ResolvedChartPaneOptions>;
  seenSeriesIds: Set<string>;
  knownOhlcSeries: ReadonlyMap<
    string,
    { paneId: string; priceScaleId: string }
  >;
  appearance: ResolvedChartAppearance;
  theme: Required<ChartTheme>;
  rsiPaneIds: ReadonlySet<string>;
  macdPaneIds: ReadonlySet<string>;
};

function validateDedicatedPanes(
  items: ReadonlyArray<NormalizedAdditionalChartSeriesOptions>
): void {
  const dedicatedPanes = new Map<string, string>();
  for (const item of items) {
    let kind = '';
    if (item.type === 'kdj') kind = 'KDJ';
    if (isFixedOscillator(item) && item.source.type === 'ohlcvWilliamsR')
      kind = 'Williams %R';
    const paneId = item.paneId;
    const previous = dedicatedPanes.get(paneId);
    if (previous !== undefined && previous !== kind) {
      throw new TypeError(
        `Pane '${item.paneId}' is dedicated to ${kind || previous}`
      );
    }
    dedicatedPanes.set(paneId, kind);
  }
}

function collectKnownOhlcSeries(
  items: ReadonlyArray<NormalizedAdditionalChartSeriesOptions>
): Map<string, { paneId: string; priceScaleId: string }> {
  const result = new Map<string, { paneId: string; priceScaleId: string }>();
  items.forEach((item) => {
    if (item.type === 'boll' || item.type === 'sar' || item.type === 'kdj')
      return;
    if (
      item.type !== 'histogram' &&
      item.type !== 'macd' &&
      !isFixedOscillator(item) &&
      !isMovingAverageSeriesOptions(item)
    ) {
      result.set(item.seriesId, {
        paneId: item.paneId,
        priceScaleId: item.priceScaleId,
      });
    }
  });
  return result;
}

function requireOhlcSource(
  seriesId: string,
  name: string,
  context: AdditionalSeriesResolutionContext
): void {
  if (!context.knownOhlcSeries.has(seriesId)) {
    throw new TypeError(
      `${name}.source.seriesId must reference data-backed OHLC data`
    );
  }
}

function resolveConfiguredMacdSeries(
  resolved: NormalizedMacdSeriesOptions,
  name: string,
  context: AdditionalSeriesResolutionContext
): ResolvedAdditionalChartSeriesOptions {
  requireOhlcSource(resolved.source.seriesId, name, context);
  if (context.rsiPaneIds.has(resolved.paneId)) {
    throw new TypeError(`${name}.paneId cannot share a pane with RSI`);
  }
  const baseLine = context.appearance.line;
  const macdColor = color(
    resolved.appearance?.macdLine?.color ?? baseLine.color,
    `${name}.appearance.macdLine.color`
  );
  const signalColor = color(
    resolved.appearance?.signalLine?.color ?? context.theme.axisTextColor,
    `${name}.appearance.signalLine.color`
  );
  const textColor =
    resolved.appearance?.textColor == null
      ? {}
      : {
          textColor: color(
            resolved.appearance.textColor,
            `${name}.appearance.textColor`
          ),
        };
  const line = (
    input: ChartLineAppearance | undefined,
    fallbackColor: string,
    prefix: string
  ) => {
    const result: Required<
      Pick<ChartLineAppearance, 'width' | 'color' | 'style'>
    > &
      Pick<ChartLineAppearance, 'gradient'> = {
      width: finitePositive(input?.width ?? baseLine.width, `${prefix}.width`),
      color: color(input?.color ?? fallbackColor, `${prefix}.color`),
      style: input?.style ?? baseLine.style,
    };
    if (input?.gradient != null) {
      result.gradient = input.gradient;
    }
    return result;
  };
  return {
    ...resolved,
    appearance: {
      macdLine: line(
        resolved.appearance?.macdLine,
        macdColor,
        `${name}.appearance.macdLine`
      ),
      signalLine: line(
        resolved.appearance?.signalLine,
        signalColor,
        `${name}.appearance.signalLine`
      ),
      histogram: {
        positiveIncreasingColor: color(
          resolved.appearance?.histogram?.positiveIncreasingColor ??
            context.theme.upColor,
          `${name}.appearance.histogram.positiveIncreasingColor`
        ),
        positiveDecreasingColor: color(
          resolved.appearance?.histogram?.positiveDecreasingColor ??
            colorWithAlpha(context.theme.upColor, '80'),
          `${name}.appearance.histogram.positiveDecreasingColor`
        ),
        negativeIncreasingColor: color(
          resolved.appearance?.histogram?.negativeIncreasingColor ??
            colorWithAlpha(context.theme.downColor, '80'),
          `${name}.appearance.histogram.negativeIncreasingColor`
        ),
        negativeDecreasingColor: color(
          resolved.appearance?.histogram?.negativeDecreasingColor ??
            context.theme.downColor,
          `${name}.appearance.histogram.negativeDecreasingColor`
        ),
      },
      zeroLineColor: color(
        resolved.appearance?.zeroLineColor ?? context.theme.gridColor,
        `${name}.appearance.zeroLineColor`
      ),
      ...textColor,
    },
  };
}

function validateConfiguredSeriesPlacement(
  { seriesId, paneId, priceScaleId }: NormalizedSeriesBase,
  name: string,
  context: AdditionalSeriesResolutionContext
): void {
  if (context.seenSeriesIds.has(seriesId)) {
    throw new TypeError(`duplicate seriesId '${seriesId}'`);
  }
  context.seenSeriesIds.add(seriesId);
  const pane = context.panes.find((candidate) => candidate.paneId === paneId);
  if (pane == null) {
    throw new TypeError(`${name}.paneId references an unknown pane`);
  }
  if (pane.priceScale.priceScaleId !== priceScaleId) {
    throw new TypeError(
      `${name}.priceScaleId must match the pane's price scale`
    );
  }
}

function resolveConfiguredFixedOscillator(
  resolved: NormalizedFixedOscillator,
  name: string,
  context: AdditionalSeriesResolutionContext
): ResolvedAdditionalChartSeriesOptions {
  if (context.macdPaneIds.has(resolved.paneId)) {
    throw new TypeError(`${name}.paneId cannot share a pane with MACD`);
  }
  requireOhlcSource(resolved.source.seriesId, name, context);
  const rsiColor = color(
    resolved.appearance?.color ?? context.appearance.line.color,
    `${name}.appearance.color`
  );
  const textColor =
    resolved.appearance?.textColor == null
      ? {}
      : {
          textColor: color(
            resolved.appearance.textColor,
            `${name}.appearance.textColor`
          ),
        };
  const gradient =
    resolved.appearance?.gradient == null
      ? {}
      : { gradient: resolved.appearance.gradient };
  return {
    ...resolved,
    appearance: {
      width: finitePositive(
        resolved.appearance?.width ?? context.appearance.line.width,
        `${name}.appearance.width`
      ),
      color: rsiColor,
      levelLineColor: color(
        resolved.appearance?.levelLineColor ?? colorWithAlpha(rsiColor, '80'),
        `${name}.appearance.levelLineColor`
      ),
      bandColor: color(
        resolved.appearance?.bandColor ?? colorWithAlpha(rsiColor, '14'),
        `${name}.appearance.bandColor`
      ),
      style: resolved.appearance?.style ?? context.appearance.line.style,
      ...textColor,
      ...gradient,
    },
  };
}

function resolveConfiguredMovingAverageSeries(
  resolved:
    | NormalizedMovingAverageSeriesOptions
    | NormalizedBollSeriesOptions
    | NormalizedSarSeriesOptions,
  name: string,
  context: AdditionalSeriesResolutionContext
): ResolvedAdditionalChartSeriesOptions {
  const source = context.knownOhlcSeries.get(resolved.source.seriesId);
  if (source == null) {
    throw new TypeError(
      `${name}.source.seriesId must reference data-backed OHLC data`
    );
  }
  if (
    source.paneId !== resolved.paneId ||
    source.priceScaleId !== resolved.priceScaleId
  ) {
    throw new TypeError(
      `${name} must use the same paneId and priceScaleId as its source series`
    );
  }
  return resolved;
}

function resolveConfiguredHistogramSeries(
  item: Extract<NormalizedAdditionalChartSeriesOptions, { type: 'histogram' }>,
  name: string,
  context: AdditionalSeriesResolutionContext
): ResolvedAdditionalChartSeriesOptions {
  const { source } = item;
  if (
    source.type === 'ohlcvVolume' &&
    !context.knownOhlcSeries.has(source.seriesId)
  ) {
    throw new TypeError(`${name}.source.seriesId must reference OHLC data`);
  }
  return {
    ...item,
    appearance: {
      color: color(
        item.appearance?.color ?? context.theme.axisTextColor,
        `${name}.appearance.color`
      ),
      upColor: color(
        item.appearance?.upColor ?? context.theme.upColor,
        `${name}.appearance.upColor`
      ),
      downColor: color(
        item.appearance?.downColor ?? context.theme.downColor,
        `${name}.appearance.downColor`
      ),
    },
  };
}

function resolveConfiguredAdditionalSeries(
  series: NormalizedAdditionalChartSeriesOptions,
  index: number,
  context: AdditionalSeriesResolutionContext
): ResolvedAdditionalChartSeriesOptions {
  const name = `additionalSeries[${index}]`;
  validateConfiguredSeriesPlacement(series, name, context);
  if (series.type === 'kdj') {
    requireOhlcSource(series.source.seriesId, name, context);
    return series;
  }
  if (
    series.type === 'sar' ||
    series.type === 'boll' ||
    isMovingAverageSeriesOptions(series)
  ) {
    return resolveConfiguredMovingAverageSeries(series, name, context);
  }
  if (series.type === 'macd') {
    return resolveConfiguredMacdSeries(series, name, context);
  }
  if (isFixedOscillator(series)) {
    return resolveConfiguredFixedOscillator(series, name, context);
  }
  if (series.type === 'baseline') {
    return {
      ...series,
      appearance: resolveBaselineAppearance(
        series.appearance,
        context.theme,
        context.appearance.baseline
      ),
    };
  }
  if (series.type === 'histogram') {
    return resolveConfiguredHistogramSeries(series, name, context);
  }
  return series;
}

function resolveMainSeries(
  input: ChartSeriesOptions | undefined,
  type: ChartSeriesType
): ResolvedChartConfig['series'] {
  if (type !== 'line' && type !== 'area' && type !== 'baseline')
    return { type };
  const series: Extract<
    ResolvedChartConfig['series'],
    { source: OhlcValueSource }
  > = {
    type,
    source: ohlcValueSource(input?.source, 'series.source'),
    ...resolveGapThreshold(input?.gapThresholdMs, 'series.gapThresholdMs'),
  };
  if (type === 'baseline')
    series.baseValue = resolveBaseValue(input?.baseValue);
  return series;
}

export function resolveChartConfig(
  props: TradingChartsViewProps
): ResolvedChartConfig {
  if (props.chartId.trim().length === 0) {
    throw new TypeError('chartId must be a non-empty string');
  }
  const resolution = resolveResolution(props);
  const tradeAggregation = resolveTradeAggregation(props, resolution);
  const initialVisibleCount = props.initialVisibleCount ?? 100;
  if (
    !Number.isInteger(initialVisibleCount) ||
    initialVisibleCount <= 0 ||
    initialVisibleCount > INT32_MAX
  ) {
    throw new TypeError(
      `initialVisibleCount must be an integer from 1 to ${INT32_MAX}`
    );
  }
  const defaultScale = finitePositive(props.defaultScale ?? 1, 'defaultScale');
  const seriesType = props.series?.type ?? 'candlestick';
  if (!isChartSeriesType(seriesType)) {
    throw new TypeError(
      "series.type must be 'candlestick', 'hollowCandlestick', 'bar', 'line', 'area' or 'baseline'"
    );
  }
  const resolvedSeries = resolveMainSeries(props.series, seriesType);
  const tooltipBackgroundOpacity = opacity(
    props.crosshair?.tooltipBackgroundOpacity ?? 1,
    'crosshair.tooltipBackgroundOpacity'
  );
  const crosshairLineStyle = props.crosshair?.lineStyle ?? 'solid';
  if (crosshairLineStyle !== 'solid' && crosshairLineStyle !== 'dashed') {
    throw new TypeError("crosshair.lineStyle must be 'solid' or 'dashed'");
  }

  const axisHeight = finitePositive(props.xAxis?.height ?? 26, 'xAxis.height');
  const xAxisSpacing = props.xAxis?.spacing ?? 'time';
  if (xAxisSpacing !== 'time' && xAxisSpacing !== 'logical') {
    throw new TypeError("xAxis.spacing must be 'time' or 'logical'");
  }
  const axisWidth = finitePositive(props.yAxis?.width ?? 64, 'yAxis.width');
  const yAxisDefaultScale = finitePositive(
    props.yAxis?.defaultScale ?? 1,
    'yAxis.defaultScale'
  );
  if (yAxisDefaultScale < 0.1 || yAxisDefaultScale > 10) {
    throw new TypeError('yAxis.defaultScale must be between 0.1 and 10');
  }
  const scaleMargins = props.yAxis?.scaleMargins ?? {
    top: 0.2,
    bottom: 0.1,
  };
  if (!hasValidScaleMargins(scaleMargins)) {
    throw new TypeError(
      `yAxis.scaleMargins must be finite, non-negative and leave at least ${MINIMUM_SCALE_CONTENT_FRACTION} of the price scale`
    );
  }

  const theme = { ...DEFAULT_THEME, ...props.theme };
  const valueFormat = resolveValueFormat(
    props.formatters?.price?.yAxis ?? props.yAxis?.valueFormat
  );
  const appearance = resolveAppearance(
    props.appearance,
    theme,
    tooltipBackgroundOpacity,
    seriesType
  );
  const formatters = resolveFormatters(
    props.formatters,
    props.xAxis ?? {},
    valueFormat
  );
  const paneInputs =
    props.panes ??
    ([
      {
        paneId: 'main',
        heightWeight: 1,
        priceScale: { priceScaleId: 'main' },
      },
    ] satisfies ChartPaneOptions[]);
  const seenPaneIds = new Set<string>();
  const seenScaleIds = new Set<string>();
  const panes = paneInputs.map((pane, index) => {
    const name = `panes[${index}]`;
    const paneId = identifier(pane.paneId, `${name}.paneId`);
    const priceScaleId = identifier(
      pane.priceScale.priceScaleId,
      `${name}.priceScale.priceScaleId`
    );
    if (seenPaneIds.has(paneId)) {
      throw new TypeError(`duplicate paneId '${paneId}'`);
    }
    if (seenScaleIds.has(priceScaleId)) {
      throw new TypeError(`duplicate priceScaleId '${priceScaleId}'`);
    }
    seenPaneIds.add(paneId);
    seenScaleIds.add(priceScaleId);
    const paneValueFormat = pane.priceScale.valueFormat;
    return {
      paneId,
      heightWeight: finitePositive(pane.heightWeight, `${name}.heightWeight`),
      minHeight: finitePositive(pane.minHeight ?? 48, `${name}.minHeight`),
      priceScale: {
        priceScaleId,
        visible:
          pane.priceScale.visible ??
          (paneId === 'main' ? (props.yAxis?.visible ?? true) : true),
        scaleMargins: resolveScaleMargins(
          pane.priceScale.scaleMargins,
          paneId === 'main' ? scaleMargins : { top: 0.1, bottom: 0 },
          `${name}.priceScale.scaleMargins`
        ),
        valueFormat:
          paneValueFormat?.type === 'volume'
            ? resolveVolumeFormat(paneValueFormat)
            : resolveValueFormat(paneValueFormat ?? valueFormat),
      },
    };
  });
  const mainPane = panes.find((pane) => pane.paneId === 'main');
  if (mainPane == null || mainPane.priceScale.priceScaleId !== 'main') {
    throw new TypeError(
      "panes must contain the reserved 'main' pane with priceScaleId 'main'"
    );
  }
  const orderedPanes = [
    mainPane,
    ...panes.filter((pane) => pane.paneId !== 'main'),
  ];

  const normalizedSeries = (props.additionalSeries ?? []).map((item, index) =>
    resolveAdditionalSeriesOptions(item, `additionalSeries[${index}]`)
  );
  validateDedicatedPanes(normalizedSeries);
  const additionalSeriesContext: AdditionalSeriesResolutionContext = {
    panes: orderedPanes,
    seenSeriesIds: new Set<string>(),
    knownOhlcSeries: new Map([
      ['main', { paneId: 'main', priceScaleId: 'main' }],
      ...collectKnownOhlcSeries(normalizedSeries),
    ]),
    appearance,
    theme,
    rsiPaneIds: new Set(
      normalizedSeries.filter(isFixedOscillator).map((series) => series.paneId)
    ),
    macdPaneIds: new Set(
      normalizedSeries
        .filter((series) => series.type === 'macd')
        .map((series) => series.paneId)
    ),
  };
  const additionalSeries: ResolvedAdditionalChartSeriesOptions[] =
    normalizedSeries.map((item, index) =>
      resolveConfiguredAdditionalSeries(item, index, additionalSeriesContext)
    );

  return {
    resolution,
    tradeAggregation,
    initialVisibleCount,
    defaultScale,
    series: resolvedSeries,
    panes: orderedPanes,
    additionalSeries,
    panesResizable: props.panesResizable ?? orderedPanes.length > 1,
    theme,
    appearance,
    formatters,
    xAxis: {
      visible: props.xAxis?.visible ?? true,
      height: axisHeight,
      locale: props.xAxis?.locale ?? 'en-GB',
      timeZone: props.xAxis?.timeZone ?? 'UTC',
      showSeconds: props.xAxis?.showSeconds ?? false,
      spacing: xAxisSpacing,
    },
    yAxis: {
      visible: props.yAxis?.visible ?? true,
      width: axisWidth,
      defaultScale: yAxisDefaultScale,
      scaleMargins: { ...scaleMargins },
      valueFormat,
    },
    gestures: {
      pan: props.gestures?.pan ?? true,
      zoom: props.gestures?.zoom ?? true,
      yAxisScale: props.gestures?.yAxisScale ?? props.gestures?.zoom ?? true,
    },
    currentPrice: {
      visible: props.currentPrice?.visible ?? true,
      showLabel: props.currentPrice?.showLabel ?? true,
      pinToEdge: props.currentPrice?.pinToEdge ?? true,
    },
    priceExtremes: {
      visible: props.priceExtremes?.visible ?? true,
    },
    crosshair: {
      enabled: props.crosshair?.enabled ?? true,
      showTooltip: props.crosshair?.showTooltip ?? true,
      showTooltipHeader: props.crosshair?.showTooltipHeader ?? true,
      tooltipBackgroundOpacity,
      lineStyle: crosshairLineStyle,
      tooltipFields: resolveTooltipFields(props.crosshair?.tooltipFields),
      tooltipLabels: {
        ...DEFAULT_CROSSHAIR_TOOLTIP_LABELS,
        ...props.crosshair?.tooltipLabels,
      },
    },
  };
}
