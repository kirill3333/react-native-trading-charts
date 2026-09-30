---
description: 'Group incoming trades into fewer native calls and manage their lifecycle.'
---

# Trade batcher

A busy trade feed may deliver many individual messages between screen updates. Sending every message through a separate native call adds work even when those trades could be processed together. The trade batcher collects them briefly and forwards them in one `updateTrades` call.

Create one batcher for each chart and feed, call `add` as trades arrive, and dispose it when the subscription ends. The default interval is 32 milliseconds. Batching keeps the individual trades so the native engine can still calculate their candle prices and volume.

`createTradeBatcher(chartId: string, options?: TradeBatcherOptions): TradeBatcher` returns the `add`, `flush` and `dispose` methods. Use `flush` when you need to send the pending batch before a controlled transition.

| Property     | Type / values                       | Default | Description                                      |
| ------------ | ----------------------------------- | ------- | ------------------------------------------------ |
| `intervalMs` | Integer from `1` to `2_147_483_647` | `32`    | Scheduled delay before forwarding queued trades. |

| Batcher method | Arguments    | Returns | Description                                                                |
| -------------- | ------------ | ------- | -------------------------------------------------------------------------- |
| `add`          | `TradeEvent` | `void`  | Validates and queues one non-decreasing trade.                             |
| `flush`        | None         | `void`  | Immediately sends the queued batch.                                        |
| `dispose`      | None         | `void`  | Cancels the timer, drops queued trades, and permanently stops the batcher. |

## Lifecycle example

<<< ../../examples/streaming.tsx

## Validation and teardown

A blank `chartId` or invalid interval throws `TypeError` during creation. `add` validates immediately: timestamps are safe non-negative integer milliseconds and non-decreasing across the entire batcher lifetime, price is finite, and optional size is finite and non-negative. Equal timestamps are allowed. Invalid trades throw `TypeError`; adding after disposal throws `Error`.

The timer starts with the first queued trade. The interval schedules delivery, but JavaScript scheduling can delay execution. `flush` sends queued trades and cancels the pending timer. `dispose` drops pending trades; call `flush()` before `dispose()` only when a controlled transition should deliver that final batch. Repeated `dispose` and `flush` after disposal are no-ops.
