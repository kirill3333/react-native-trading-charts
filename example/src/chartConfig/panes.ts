import { type ChartPaneOptions } from 'react-native-trading-charts';

import { type ChartSettings } from '../stores/chartSettingsStore';

export type ChartPaneVisibility = {
  minMove: number;
  showVolume: boolean;
  showRsi: boolean;
  showMacd: boolean;
};

export function buildChartPanes(
  settings: ChartSettings,
  { minMove, showVolume, showRsi, showMacd }: ChartPaneVisibility
): ReadonlyArray<ChartPaneOptions> | undefined {
  if (!showVolume && !showRsi && !showMacd) return undefined;
  const panes: ChartPaneOptions[] = [
    {
      paneId: 'main',
      heightWeight: settings.mainPaneHeightWeight,
      priceScale: { priceScaleId: 'main' },
    },
  ];
  if (showVolume) {
    panes.push({
      paneId: 'volume',
      heightWeight: settings.volumePaneHeightWeight,
      minHeight: 56,
      priceScale: {
        priceScaleId: 'volume',
        valueFormat: { type: 'volume', precision: 1 },
      },
    });
  }
  if (showRsi) {
    panes.push({
      paneId: 'rsi',
      heightWeight: settings.rsiPaneHeightWeight,
      minHeight: 96,
      priceScale: {
        priceScaleId: 'rsi',
        valueFormat: {
          type: 'price',
          precision: 4,
          minMove: 0.0001,
          useGrouping: false,
        },
      },
    });
  }
  if (showMacd) {
    panes.push({
      paneId: 'macd',
      heightWeight: settings.macdPaneHeightWeight,
      minHeight: 96,
      priceScale: {
        priceScaleId: 'macd',
        valueFormat: {
          type: 'significant',
          significantDigits: 3,
          minMove,
          locale: settings.locale,
          useGrouping: false,
        },
      },
    });
  }
  return panes;
}
