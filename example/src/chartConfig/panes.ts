import { type ChartPaneOptions } from 'react-native-trading-charts';

import { type ChartSettings } from '../stores/chartSettingsStore';

export type ChartPaneVisibility = {
  minMove: number;
  showVolume: boolean;
  showRsi: boolean;
  showWilliamsR?: boolean;
  showKdj?: boolean;
  showMacd: boolean;
};

export function hasChartPanels({
  showVolume,
  showRsi,
  showMacd,
  showWilliamsR,
  showKdj,
}: Omit<ChartPaneVisibility, 'minMove'>): boolean {
  return [showVolume, showRsi, showMacd, showWilliamsR, showKdj].some(Boolean);
}

export function buildChartPanes(
  settings: ChartSettings,
  {
    minMove,
    showVolume,
    showRsi,
    showWilliamsR,
    showKdj,
    showMacd,
  }: ChartPaneVisibility
): ReadonlyArray<ChartPaneOptions> | undefined {
  if (
    !hasChartPanels({ showVolume, showRsi, showMacd, showWilliamsR, showKdj })
  )
    return undefined;
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
  if (showWilliamsR) {
    panes.push({
      paneId: 'williamsR',
      heightWeight: settings.williamsRPaneHeightWeight,
      minHeight: 96,
      priceScale: {
        priceScaleId: 'williamsR',
        valueFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01,
          useGrouping: false,
        },
      },
    });
  }
  if (showKdj) {
    panes.push({
      paneId: 'kdj',
      heightWeight: settings.kdjPaneHeightWeight,
      minHeight: 96,
      priceScale: {
        priceScaleId: 'kdj',
        valueFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01,
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
