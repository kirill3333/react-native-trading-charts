import {
  type ChartAppearance,
  type ChartBorderStyle,
  type ChartFormatters,
  type ChartTheme,
  type ChartTextStyle,
  type CompactValueFormat,
  type PriceDisplayFormat,
  type PriceValueFormat,
  type ResolvedChartAppearance,
  type ResolvedChartConfig,
  type ResolvedChartFormatters,
  type ResolvedChartTextStyle,
  type ResolvedPriceDisplayFormat,
  type SignificantValueFormat,
  type TradingChartsViewProps,
  type YAxisValueFormat,
} from './types';

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

function nonEmpty(value: string, name: string): string {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
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
    radius: finiteNonNegative(
      input?.radius ?? defaultRadius,
      `${name}.radius`
    ),
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
      (fallback.type === 'significant'
        ? fallback.significantDigits
        : 3);
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

function resolveAppearance(
  input: ChartAppearance | undefined,
  theme: Required<ChartTheme>,
  legacyTooltipOpacity: number
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
    backgroundColor,
    grid: {
      color: gridColor,
      opacity: opacity(
        input?.grid?.opacity ?? 0.75,
        'appearance.grid.opacity'
      ),
    },
    candles: { upColor, downColor },
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
          input?.currentPrice?.line?.upColor ?? upColor,
          'appearance.currentPrice.line.upColor'
        ),
        downColor: color(
          input?.currentPrice?.line?.downColor ?? downColor,
          'appearance.currentPrice.line.downColor'
        ),
      },
      label: {
        upBackgroundColor: color(
          input?.currentPrice?.label?.upBackgroundColor ?? upColor,
          'appearance.currentPrice.label.upBackgroundColor'
        ),
        downBackgroundColor: color(
          input?.currentPrice?.label?.downBackgroundColor ?? downColor,
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
        input?.tooltip?.positiveValueColor ?? upColor,
        'appearance.tooltip.positiveValueColor'
      ),
      negativeValueColor: color(
        input?.tooltip?.negativeValueColor ?? downColor,
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
        time: pattern(
          xInput?.time,
          'HH:mm',
          'formatters.date.xAxis.time'
        ),
        day: pattern(
          xInput?.day,
          'd MMM',
          'formatters.date.xAxis.day'
        ),
        month: pattern(
          xInput?.month,
          'MMM yyyy',
          'formatters.date.xAxis.month'
        ),
        year: pattern(
          xInput?.year,
          'yyyy',
          'formatters.date.xAxis.year'
        ),
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

export function resolveChartConfig(
  props: TradingChartsViewProps
): ResolvedChartConfig {
  if (typeof props.chartId !== 'string' || props.chartId.trim().length === 0) {
    throw new TypeError('chartId must be a non-empty string');
  }
  const timeframeMs = finitePositive(
    props.timeframeMs ?? 60_000,
    'timeframeMs'
  );
  if (!Number.isSafeInteger(timeframeMs)) {
    throw new TypeError('timeframeMs must be a positive integer');
  }
  const initialVisibleCount = props.initialVisibleCount ?? 100;
  if (!Number.isInteger(initialVisibleCount) || initialVisibleCount <= 0) {
    throw new TypeError('initialVisibleCount must be a positive integer');
  }
  const defaultScale = finitePositive(props.defaultScale ?? 1, 'defaultScale');
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
  if (
    !Number.isFinite(scaleMargins.top) ||
    scaleMargins.top < 0 ||
    !Number.isFinite(scaleMargins.bottom) ||
    scaleMargins.bottom < 0 ||
    scaleMargins.top + scaleMargins.bottom >= 1
  ) {
    throw new TypeError(
      'yAxis.scaleMargins must be finite, non-negative and sum to less than 1'
    );
  }

  const theme = { ...DEFAULT_THEME, ...props.theme };
  const valueFormat = resolveValueFormat(
    props.formatters?.price?.yAxis ?? props.yAxis?.valueFormat
  );
  const appearance = resolveAppearance(
    props.appearance,
    theme,
    tooltipBackgroundOpacity
  );
  const formatters = resolveFormatters(
    props.formatters,
    props.xAxis ?? {},
    valueFormat
  );

  return {
    timeframeMs,
    initialVisibleCount,
    defaultScale,
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
      position: props.yAxis?.position ?? 'right',
      width: axisWidth,
      defaultScale: yAxisDefaultScale,
      scaleMargins: { ...scaleMargins },
      valueFormat,
    },
    gestures: {
      pan: props.gestures?.pan ?? true,
      zoom: props.gestures?.zoom ?? true,
      yAxisScale:
        props.gestures?.yAxisScale ?? props.gestures?.zoom ?? true,
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
      tooltipBackgroundOpacity,
      lineStyle: crosshairLineStyle,
      tooltipLabels: {
        ...DEFAULT_CROSSHAIR_TOOLTIP_LABELS,
        ...props.crosshair?.tooltipLabels,
      },
    },
  };
}
