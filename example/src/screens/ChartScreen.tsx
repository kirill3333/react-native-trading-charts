import { useCallback } from 'react';
import {
  type StaticScreenProps,
  useNavigation,
} from '@react-navigation/native';
import { type NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  type ChartResolution,
  type VisibleRangeChangeEvent,
} from 'react-native-trading-charts';

import { ConnectionBadge } from '../components/ConnectionBadge';
import { tickerPair } from '../marketPresentation';
import { useChartActivation } from '../hooks/useChartActivation';
import {
  BINANCE_INTERVALS,
  type BinanceInterval,
  type BinanceTicker,
} from '../api/binance';
import {
  HYPERLIQUID_INTERVALS,
  type HyperliquidInterval,
  type HyperliquidTicker,
} from '../api/hyperliquid';
import {
  binanceMarketData,
  chartIdFor,
  hyperliquidChartIdFor,
  hyperliquidMarketData,
  type MarketDataAdapter,
} from '../api/marketData';
import { useChartDataFeed } from '../api/useChartDataFeed';
import { ChartWorkspace } from '../components/ChartWorkspace';
import { ChartErrorBanner } from '../components/ChartErrorBanner';
import { ChartHeader } from '../components/ChartHeader';
import { InteractiveChart } from '../components/InteractiveChart';
import {
  TimeIntervalSelector,
  type TimeIntervalOption,
} from '../components/TimeIntervalSelector';
import { useChartOrientation } from '../hooks/useChartOrientation';
import { useChartControlsStore } from '../stores/chartControlsStore';

export type ChartRouteParams =
  | {
      provider: 'binance';
      ticker: BinanceTicker;
      interval: BinanceInterval;
    }
  | {
      provider: 'hyperliquid';
      ticker: HyperliquidTicker;
      interval: HyperliquidInterval;
    };

type ChartScreenProps = StaticScreenProps<ChartRouteParams>;
type ChartInterval = ChartRouteParams['interval'];
type ChartNavigation = NativeStackNavigationProp<
  { Chart: ChartRouteParams },
  'Chart'
>;

const DEFAULT_RESOLUTION: ChartResolution = { unit: 'minute' };

type PriceTicker = {
  symbol: string;
  lastPrice: number;
  change24hPercent: number;
  precision: number;
  minMove: number;
};

type IntervalOption<TInterval extends ChartInterval> =
  TimeIntervalOption<TInterval> & {
    resolution: ChartResolution;
  };

type ChartContentProps<
  TTicker extends PriceTicker,
  TInterval extends ChartInterval,
  TMessage,
> = {
  ticker: TTicker;
  interval: TInterval;
  intervals: ReadonlyArray<IntervalOption<TInterval>>;
  adapter: MarketDataAdapter<TTicker, TInterval, TMessage>;
  chartId: string;
  baseAsset: string;
  quoteAsset: string;
  venueLabel: string;
  isLandscape: boolean;
  onToggleOrientation: () => void;
};

function ChartContent<
  TTicker extends PriceTicker,
  TInterval extends ChartInterval,
  TMessage,
>({
  ticker,
  interval,
  intervals,
  adapter,
  chartId,
  baseAsset,
  quoteAsset,
  venueLabel,
  isLandscape,
  onToggleOrientation,
}: ChartContentProps<TTicker, TInterval, TMessage>) {
  const navigation = useNavigation<ChartNavigation>();
  const showVolume = useChartControlsStore((state) => state.showVolume);
  const showRsi = useChartControlsStore((state) => state.showRsi);
  const showMacd = useChartControlsStore((state) => state.showMacd);
  const intervalConfig =
    intervals.find((item) => item.value === interval) ?? intervals[0];
  const resolution = intervalConfig?.resolution ?? DEFAULT_RESOLUTION;

  const { status, error, lastPrice, allTimeExtremes, loadOlder, retry } =
    useChartDataFeed(adapter, ticker, interval, chartId);
  const displayedPrice = lastPrice ?? ticker.lastPrice;

  useChartActivation(chartId);

  const changeInterval = useCallback(
    (nextInterval: TInterval) => {
      if (nextInterval === interval) {
        return;
      }
      navigation.setParams({ interval: nextInterval });
    },
    [interval, navigation]
  );

  const handleVisibleRangeChange = useCallback(
    (event: VisibleRangeChangeEvent) => {
      const { firstVisibleIndex, lastVisibleIndex } = event;
      const visibleCount = lastVisibleIndex - firstVisibleIndex + 1;
      const preloadThreshold = Math.max(30, visibleCount * 2);
      if (firstVisibleIndex <= preloadThreshold) {
        loadOlder();
      }
    },
    [loadOlder]
  );

  const hasError = status === 'error' || status === 'no-data';
  const errorStatus =
    status === 'no-data'
      ? `${venueLabel} returned no data for this market and interval`
      : `Could not connect to ${venueLabel}`;

  return (
    <ChartWorkspace
      chartId={chartId}
      isLandscape={isLandscape}
      onToggleOrientation={onToggleOrientation}
      header={
        <ChartHeader
          baseAsset={baseAsset}
          change24hPercent={ticker.change24hPercent}
          onBack={() => navigation.goBack()}
          price={displayedPrice}
          pricePrecision={ticker.precision}
          quoteAsset={quoteAsset}
          venueLabel={venueLabel}
        />
      }
      toolbar={
        <>
          <TimeIntervalSelector
            intervals={intervals}
            onSelect={changeInterval}
            selectedInterval={interval}
          />
          {hasError ? (
            <ChartErrorBanner message={error ?? errorStatus} onRetry={retry} />
          ) : null}
        </>
      }
    >
      <InteractiveChart
        allTimeExtremes={allTimeExtremes}
        chartId={chartId}
        key={chartId}
        lastPrice={ticker.lastPrice}
        minMove={ticker.minMove}
        onVisibleRangeChange={handleVisibleRangeChange}
        precision={ticker.precision}
        showVolume={showVolume}
        showRsi={showRsi}
        showMacd={showMacd}
        resolution={resolution}
      />
      <ConnectionBadge status={status} />
    </ChartWorkspace>
  );
}

export function ChartScreen({ route }: ChartScreenProps) {
  const navigation = useNavigation<ChartNavigation>();
  const { isLandscape, toggleOrientation } = useChartOrientation(navigation);
  const params = route.params;
  const pair = tickerPair(params.ticker);
  if (params.provider === 'hyperliquid') {
    return (
      <ChartContent
        isLandscape={isLandscape}
        onToggleOrientation={toggleOrientation}
        adapter={hyperliquidMarketData}
        baseAsset={pair.base}
        chartId={hyperliquidChartIdFor(params.ticker.symbol, params.interval)}
        interval={params.interval}
        intervals={HYPERLIQUID_INTERVALS}
        quoteAsset={pair.quote}
        ticker={params.ticker}
        venueLabel="Hyperliquid Perpetual"
      />
    );
  }
  return (
    <ChartContent
      isLandscape={isLandscape}
      onToggleOrientation={toggleOrientation}
      adapter={binanceMarketData}
      baseAsset={pair.base}
      chartId={chartIdFor(params.ticker.symbol, params.interval)}
      interval={params.interval}
      intervals={BINANCE_INTERVALS}
      quoteAsset={pair.quote}
      ticker={params.ticker}
      venueLabel="Binance Spot"
    />
  );
}
