import {
  type AdditionalChartSeriesOptions,
  type ChartLineAppearance,
  type MacdSeriesOptions,
  type BollSeriesOptions,
  type SarSeriesOptions,
  type RsiSeriesAppearance,
} from 'react-native-trading-charts';

import { type ChartSettings } from '../stores/chartSettingsStore';
import { APP_THEMES } from '../theme';
import { readLineSettings, type LineSettings } from '../lineSettings';
import { type ChartPaneVisibility } from './panes';

type VolumeAppearance = {
  upColor: string;
  downColor: string;
};

export function buildVolumeAppearance(
  settings: ChartSettings
): VolumeAppearance {
  const theme = APP_THEMES[settings.themeMode];
  return {
    upColor: settings.volumeUpColorOverride ?? theme.volumeUpColor,
    downColor: settings.volumeDownColorOverride ?? theme.volumeDownColor,
  };
}

export function buildRsiAppearance(
  settings: ChartSettings
): Required<
  Pick<
    RsiSeriesAppearance,
    'width' | 'color' | 'textColor' | 'levelLineColor' | 'bandColor'
  >
> {
  const theme = APP_THEMES[settings.themeMode];
  return {
    width: settings.rsiLineWidth,
    color: settings.rsiLineColorOverride ?? theme.rsiColor,
    textColor: settings.rsiTextColorOverride ?? theme.rsiTextColor,
    levelLineColor:
      settings.rsiLevelLineColorOverride ?? theme.rsiLevelLineColor,
    bandColor: settings.rsiBandColorOverride ?? theme.rsiBandColor,
  };
}

export function buildBollSeries(settings: ChartSettings): BollSeriesOptions {
  return {
    seriesId: 'boll',
    type: 'boll',
    paneId: 'main',
    priceScaleId: 'main',
    source: {
      type: 'ohlcvBoll',
      seriesId: 'main',
      period: settings.bollPeriod,
      stdDevMultiplier: settings.bollStdDevMultiplier,
      valueSource: settings.bollValueSource,
    },
    appearance: {
      upperLine: buildLineAppearance(settings.bollUpperLine),
      middleLine: buildLineAppearance(settings.bollMiddleLine),
      lowerLine: buildLineAppearance(settings.bollLowerLine),
      fill: {
        enabled: settings.bollFillEnabled,
        topColor: settings.bollFillTopColor,
        bottomColor: settings.bollFillBottomColor,
      },
    },
  };
}

export function buildMovingAverageSeries(
  settings: ChartSettings
): AdditionalChartSeriesOptions[] {
  const averages = [
    {
      kind: 'sma',
      enabled: settings.smaEnabled,
      type: 'ohlcvSma',
      period: settings.smaPeriod,
      valueSource: settings.smaValueSource,
    },
    {
      kind: 'ema',
      enabled: settings.emaEnabled,
      type: 'ohlcvEma',
      period: settings.emaPeriod,
      valueSource: settings.emaValueSource,
    },
  ] as const;
  return averages
    .filter(({ enabled }) => enabled)
    .map(({ kind, type, period, valueSource }) => ({
      seriesId: kind,
      type: 'line',
      paneId: 'main',
      priceScaleId: 'main',
      source: { type, seriesId: 'main', period, valueSource },
      appearance: buildLineAppearance(readLineSettings(settings, kind)),
    }));
}

export function buildMacdSeries(settings: ChartSettings): MacdSeriesOptions {
  const theme = APP_THEMES[settings.themeMode].macd;
  return {
    seriesId: 'macd',
    type: 'macd',
    paneId: 'macd',
    priceScaleId: 'macd',
    source: {
      type: 'ohlcvMacd',
      seriesId: 'main',
      fastPeriod: settings.macdFastPeriod,
      slowPeriod: settings.macdSlowPeriod,
      signalPeriod: settings.macdSignalPeriod,
      valueSource: settings.macdValueSource,
    },
    appearance: {
      macdLine: buildLineAppearance(readLineSettings(settings, 'macd')),
      signalLine: buildLineAppearance(readLineSettings(settings, 'signal')),
      histogram: {
        positiveIncreasingColor:
          settings.macdPositiveIncreasingColor ?? theme.positiveIncreasingColor,
        positiveDecreasingColor:
          settings.macdPositiveDecreasingColor ?? theme.positiveDecreasingColor,
        negativeIncreasingColor:
          settings.macdNegativeIncreasingColor ?? theme.negativeIncreasingColor,
        negativeDecreasingColor:
          settings.macdNegativeDecreasingColor ?? theme.negativeDecreasingColor,
      },
      textColor: settings.macdTextColor ?? theme.textColor,
      zeroLineColor: settings.macdZeroLineColor ?? theme.zeroLineColor,
    },
  };
}

export function buildSarSeries(settings: ChartSettings): SarSeriesOptions {
  return {
    seriesId: 'sar',
    type: 'sar',
    paneId: 'main',
    priceScaleId: 'main',
    source: {
      type: 'ohlcvSar',
      seriesId: 'main',
      step: settings.sarStep,
      maximum: settings.sarMaximum,
    },
    appearance: {
      upColor: settings.sarUpColor,
      downColor: settings.sarDownColor,
      reversalColor: settings.sarReversalColor,
    },
  };
}

export function buildLineAppearance(value: LineSettings): ChartLineAppearance {
  const appearance: ChartLineAppearance = {
    width: value.width,
    style: value.style,
    color: value.color,
  };
  if (value.gradientEnabled) {
    appearance.gradient = {
      topColor: value.gradientTopColor,
      bottomColor: value.gradientBottomColor,
    };
  }
  return appearance;
}

export function buildAdditionalSeries(
  settings: ChartSettings,
  { showVolume, showRsi, showMacd }: Omit<ChartPaneVisibility, 'minMove'>
): ReadonlyArray<AdditionalChartSeriesOptions> | undefined {
  const result: AdditionalChartSeriesOptions[] =
    buildMovingAverageSeries(settings);
  if (settings.bollEnabled) result.push(buildBollSeries(settings));
  if (settings.sarEnabled) result.push(buildSarSeries(settings));
  if (showVolume) {
    result.push({
      seriesId: 'volume',
      type: 'histogram',
      paneId: 'volume',
      priceScaleId: 'volume',
      source: { type: 'ohlcvVolume', seriesId: 'main' },
      appearance: buildVolumeAppearance(settings),
    });
  }
  if (showRsi) {
    result.push({
      seriesId: 'rsi',
      type: 'line',
      paneId: 'rsi',
      priceScaleId: 'rsi',
      source: { type: 'ohlcvRsi', seriesId: 'main', period: 14 },
      levels: { oversold: 30, overbought: 70 },
      appearance: buildRsiAppearance(settings),
    });
  }
  if (showMacd) {
    result.push(buildMacdSeries(settings));
  }
  return result.length > 0 ? result : undefined;
}
