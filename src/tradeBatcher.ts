import NativeTradingCharts, {
  type Spec as NativeTradingChartsSpec,
} from './NativeTradingCharts';
import { assertChartId, validateTrade } from './TradingCharts';
import { type TradeEvent } from './types';

const MAX_TIMER_DELAY_MS = 2_147_483_647;

export type TradeBatcherOptions = {
  /** Flush interval in milliseconds. Defaults to 32. */
  intervalMs?: number;
};

export type TradeBatcher = {
  /**
   * Queue one trade. Validates synchronously, so invalid or out-of-order
   * input throws in the caller's stack instead of inside the flush timer.
   */
  add(trade: TradeEvent): void;
  /** Send everything queued so far. */
  flush(): void;
  /** Permanently stop the batcher, drop queued trades, and cancel its timer. */
  dispose(): void;
};

/**
 * Accumulates high-frequency trade events and forwards them to the chart as
 * one updateTrades call per interval. Validation and packing still happen on
 * the JS thread; batching reduces JS-to-native calls and engine mutations:
 *
 *   const batcher = createTradeBatcher(chartId);
 *   ws.onmessage = (message) => batcher.add(parseTrade(message));
 */
export function createTradeBatcher(
  chartId: string,
  options?: TradeBatcherOptions
): TradeBatcher {
  return createTradeBatcherWithNativeModule(
    NativeTradingCharts,
    chartId,
    options
  );
}

export function createTradeBatcherWithNativeModule(
  nativeTradingCharts: Pick<NativeTradingChartsSpec, 'updateTrades'>,
  chartId: string,
  options?: TradeBatcherOptions
): TradeBatcher {
  assertChartId(chartId);
  const intervalMs = options?.intervalMs ?? 32;
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs <= 0 ||
    intervalMs > MAX_TIMER_DELAY_MS
  ) {
    throw new TypeError(
      `intervalMs must be an integer between 1 and ${MAX_TIMER_DELAY_MS}`
    );
  }
  let packed: number[] = [];
  let lastTimestamp = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function flush() {
    if (disposed) return;
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    if (packed.length === 0) return;
    const batch = packed;
    packed = [];
    nativeTradingCharts.updateTrades(chartId, batch);
  }

  return {
    add(trade: TradeEvent) {
      if (disposed) {
        throw new Error('trade batcher has been disposed');
      }
      validateTrade(trade);
      if (trade.timestamp < lastTimestamp) {
        throw new TypeError('trades must have non-decreasing timestamps');
      }
      packed.push(trade.timestamp, trade.price, trade.size ?? 0);
      lastTimestamp = trade.timestamp;
      if (timer == null) {
        timer = setTimeout(flush, intervalMs);
      }
    },
    flush,
    dispose() {
      if (disposed) return;
      disposed = true;
      packed = [];
      lastTimestamp = -Infinity;
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
