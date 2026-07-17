import {
  type CompactValueFormat,
  type PriceValueFormat,
  type ResolvedChartConfig,
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

function finitePositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number`);
  }
  return value;
}

function resolveValueFormat(input?: YAxisValueFormat) {
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

  const axisHeight = finitePositive(props.xAxis?.height ?? 26, 'xAxis.height');
  const axisWidth = finitePositive(props.yAxis?.width ?? 64, 'yAxis.width');
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

  return {
    timeframeMs,
    initialVisibleCount,
    theme: { ...DEFAULT_THEME, ...props.theme },
    xAxis: {
      visible: props.xAxis?.visible ?? true,
      height: axisHeight,
      locale: props.xAxis?.locale ?? 'en-GB',
      timeZone: props.xAxis?.timeZone ?? 'UTC',
      showSeconds: props.xAxis?.showSeconds ?? false,
    },
    yAxis: {
      visible: props.yAxis?.visible ?? true,
      position: props.yAxis?.position ?? 'right',
      width: axisWidth,
      scaleMargins: { ...scaleMargins },
      valueFormat: resolveValueFormat(props.yAxis?.valueFormat),
    },
    gestures: {
      pan: props.gestures?.pan ?? true,
      zoom: props.gestures?.zoom ?? true,
    },
    currentPrice: {
      visible: props.currentPrice?.visible ?? true,
      showLabel: props.currentPrice?.showLabel ?? true,
    },
    crosshair: {
      enabled: props.crosshair?.enabled ?? true,
      showTooltip: props.crosshair?.showTooltip ?? true,
    },
  };
}
