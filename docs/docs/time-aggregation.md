---
description: 'Choose candle intervals and market-session rules for incoming trades.'
---

# Time & trade aggregation

Trade aggregation turns individual executions into candles. On a one-minute chart, the first trade in a minute sets the open, later trades update the high and low, and the latest trade sets the close. Their sizes add up to volume.

Set `resolution` to choose the interval. A market that trades around the clock can use regular minute or hour buckets. An exchange with opening hours may need buckets aligned to the session open, along with holidays or shorter sessions. `tradeAggregation` supplies those calendar rules.

These settings apply when you send raw trades. Candles supplied by your feed keep their original timestamps. All timestamps are milliseconds; label formatting has its own settings under [Axes & formatting](/docs/axes).

## Resolution

Resolution is the amount of time represented by one aggregated candle. `{ unit: 'minute', multiplier: 5 }` groups trades into five-minute intervals. Use `fixed` for a duration that does not fit a calendar unit.

| Property     | Type / values                                                  | Default                | Description                        |
| ------------ | -------------------------------------------------------------- | ---------------------- | ---------------------------------- |
| `unit`       | `'second'`, `'minute'`, `'hour'`, `'day'`, `'week'`, `'month'` | `'minute'`             | Calendar-aware resolution unit.    |
| `multiplier` | Positive integer                                               | `1`                    | Number of units in one bucket.     |
| `unit`       | `'fixed'`                                                      | Not applicable         | Selects an exact elapsed duration. |
| `durationMs` | Positive safe integer                                          | Required for `'fixed'` | Exact fixed bucket duration.       |

Daily, weekly, and monthly resolutions follow calendar boundaries; a month is
not treated as 30 days. Fixed resolutions never acquire calendar-duration
semantics.

## Aggregation properties

Bucket origin decides where each interval begins. An hourly chart aligned to a 09:30 session open has different boundaries from one aligned to the hour. The other options decide how to handle trades outside sessions and which timestamp to attach to each candle.

| Property          | Type / values                           | Default         | Description                                                        |
| ----------------- | --------------------------------------- | --------------- | ------------------------------------------------------------------ |
| `bucketOrigin`    | `'epoch'`, `'session'`, `{ timestamp }` | `'epoch'`       | Aligns intraday or fixed buckets.                                  |
| `calendar`        | `TradingCalendar`                       | `undefined`     | Defines market sessions and trading dates.                         |
| `outsideSession`  | `'ignore'`, `'reject'`                  | `'ignore'`      | Ignores off-session trades or reports invalid input.               |
| `candleTimestamp` | `'bucketStart'`, `'tradingDateUtc'`     | `'bucketStart'` | Timestamp convention; trading-date UTC is for day/week/month only. |

## Calendar properties

A calendar describes when the market trades in its local time zone. Weekly sessions cover regular hours; holidays close a date, and overrides handle dates with different hours.

| Property       | Type / values               | Default    | Description                                                 |
| -------------- | --------------------------- | ---------- | ----------------------------------------------------------- |
| `timeZone`     | IANA time-zone string       | Required   | Controls session/calendar boundaries, including DST.        |
| `sessions`     | `TradingSession[]`          | `[]`       | Recurring weekly trading sessions.                          |
| `holidays`     | `YYYY-MM-DD[]`              | `[]`       | Fully closed trading dates.                                 |
| `overrides`    | `TradingCalendarOverride[]` | `[]`       | Date-specific hours; an empty session list closes the date. |
| `weekStartsOn` | `'monday'`, `'sunday'`      | `'monday'` | Weekly bucket boundary.                                     |

| Session property | Type / values         | Default                         | Description                                    |
| ---------------- | --------------------- | ------------------------------- | ---------------------------------------------- |
| `days`           | Weekday names         | Required for recurring sessions | Days on which the segment opens.               |
| `start` / `end`  | `HH:mm` or `HH:mm:ss` | Required                        | Local session times; end is exclusive.         |
| `startDayOffset` | `-1` or `0`           | `0`                             | Moves the start to the prior trading-date day. |
| `endDayOffset`   | `0` or `1`            | Inferred for overnight sessions | Moves the end to the following day.            |

For a market with continuous trading, `resolution: { unit: 'minute' }` gives regular one-minute buckets without a session calendar.

For a market with opening hours, use a session calendar to align intraday buckets to each open, as in the example below.

Use `resolution` set to `{ unit: 'fixed', durationMs: 250 }` for an exact interval.

`calendar.timeZone` affects aggregation boundaries. `xAxis.timeZone` affects
labels only and can be configured independently.

## Session-aligned chart

<<< ../examples/time-aggregation.tsx
