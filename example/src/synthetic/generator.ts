import { type OhlcCandle, type TradeEvent } from 'react-native-trading-charts';

import { type SyntheticSettings } from './settings';

export class SyntheticGenerator {
  private sign = 1;
  private position = 0.5;
  private displayedPosition = 0.5;
  private drift = 0;
  private targetDrift = 0;
  private volatility = 1;
  private targetVolatility = 1;
  private regimeRemaining = 0;

  constructor(
    private readonly settings: SyntheticSettings,
    private readonly random: () => number = Math.random
  ) {}

  nextPrice(elapsedSeconds = 1 / this.settings.eventsPerSecond): number {
    const { intensity } = this.settings;
    const t = intensity / 100;
    this.sign *= -1;
    if (t === 0) return this.priceAt(0.5);
    if (t === 1) {
      this.displayedPosition = this.sign < 0 ? 0 : 1;
      return this.priceAt(this.displayedPosition);
    }

    this.advanceRegime(elapsedSeconds);
    // Carry the previous price forward. Drift persists for several candles,
    // while noise and changing volatility produce pullbacks and varied wicks.
    const amplitude = 0.03 * t * t;
    const noise = (this.random() + this.random() + this.random() - 1.5) * 2;
    const boundaryPull =
      Math.max(0, 0.15 - this.position) - Math.max(0, this.position - 0.85);
    const move =
      amplitude *
        this.volatility *
        (this.drift * elapsedSeconds + noise * Math.sqrt(elapsedSeconds)) +
      boundaryPull * elapsedSeconds * 0.1;
    const next = this.position + move;
    // Reflect at the limits instead of accumulating flat candles against them.
    const wrapped = ((next % 2) + 2) % 2;
    this.position = wrapped <= 1 ? wrapped : 2 - wrapped;

    // Reserve the upper end of the control for deliberate stress-test jumps.
    const jumpWeight = Math.max(0, (t - 0.8) / 0.2) ** 2;
    const extreme = this.sign < 0 ? 0 : 1;
    this.displayedPosition =
      this.position * (1 - jumpWeight) + extreme * jumpWeight;
    return this.priceAt(this.displayedPosition);
  }

  private advanceRegime(elapsedSeconds: number) {
    if (this.regimeRemaining <= 0) {
      this.regimeRemaining = 8 + this.random() * 24;
      this.targetDrift = (this.random() * 2 - 1) * 0.7;
      this.targetVolatility = 0.35 + this.random() * 1.5;
    }
    this.regimeRemaining -= elapsedSeconds;
    this.drift +=
      (this.targetDrift - this.drift) * (1 - Math.exp(-elapsedSeconds / 2));
    this.volatility +=
      (this.targetVolatility - this.volatility) *
      (1 - Math.exp(-elapsedSeconds / 3));
  }

  private priceAt(position: number): number {
    const { minPrice, maxPrice } = this.settings;
    return Math.max(
      minPrice,
      Math.min(maxPrice, minPrice + (maxPrice - minPrice) * position)
    );
  }

  nextTrade(
    timestamp: number,
    elapsedSeconds = 1 / this.settings.eventsPerSecond
  ): TradeEvent {
    const price = this.nextPrice(elapsedSeconds);
    // Match the expected volume per second in four-sample history and live
    // streams, regardless of the configured event rate.
    const size = (1 + this.random() * 9) * this.volatility * elapsedSeconds * 4;
    return { timestamp, price, size };
  }

  nextCandle(timestamp: number): OhlcCandle {
    const open = this.priceAt(this.displayedPosition);
    const candle: OhlcCandle = {
      timestamp,
      open,
      high: open,
      low: open,
      close: open,
      volume: 0,
    };
    for (let index = 0; index < 4; index += 1) {
      const trade = this.nextTrade(timestamp + index * 250, 0.25);
      candle.high = Math.max(candle.high, trade.price);
      candle.low = Math.min(candle.low, trade.price);
      candle.close = trade.price;
      candle.volume = (candle.volume ?? 0) + (trade.size ?? 0);
    }
    return candle;
  }
}
