# ChartEngine state and rendering protocol

This document is the normative contract for commands that can change
`ChartEngine` state. The C++ contract tests must change in the same commit as
any intentional change to this protocol.

## Boundary

Exchange REST and WebSocket formats are outside this protocol. Applications
normalize provider messages before calling the engine. The native boundary
passes packed numeric records:

| Record | Layout |
| --- | --- |
| Candle | `[timestamp, open, high, low, close, volume]` |
| Trade | `[timestamp, price, size]` |
| Histogram point | `[timestamp, value]` |

Timestamps are integer milliseconds in the JavaScript safe-integer range.
Candle and series arrays are strictly increasing. Trade batches are
non-decreasing and may contain equal timestamps.

## Published state

`revision` identifies all render-relevant state. `content_revision` identifies
state that can change content geometry, ticks, labels, pane layout, or other
non-crosshair presentation.

Every public command obeys these rules:

1. A content change increments both `revision` and `content_revision`.
2. A crosshair-only change increments `revision` and preserves
   `content_revision`.
3. A rejected command changes neither revision.
4. `Snapshot()` returns the same `shared_ptr` while `revision` is unchanged.
5. After a revision change, `Snapshot()` returns a new immutable object whose
   revisions match the engine.
6. A crosshair-only snapshot shares `content_vertices` with the preceding
   snapshot.
7. A result used by a native caller for conditional frame scheduling reports a
   change whenever the command increments `revision`.

An accepted command may be an explicit no-op. Therefore `kApplied` implies
that input was accepted; it does not by itself guarantee a revision change.
The reverse implication is mandatory: an `UpdateStatus` command cannot change
render state unless it returns `kApplied`.

## Result types

| Result | Meaning |
| --- | --- |
| `kApplied` | Input was accepted. If render state changed, revisions were published. |
| `kIgnoredOldTimestamp` | The record was older than accepted state; no render change. |
| `kInvalidInput` | Shape, value, target, calendar, or ordering validation failed; no render change. |
| `kIgnoredOutsideSession` | The configured ignore policy consumed an off-session trade without a render change. |
| `true` | The command changed render state and published a revision. |
| `false` | The command did not change render state. |

Void commands are either unconditional publishers or have an explicit no-op
condition in the command table.

## Command contract

| Command | Acceptance and atomicity | Publication |
| --- | --- | --- |
| `SetConfig` | Normalizes and replaces the configuration. | Always content. |
| `SetTradingCalendar` | Normalizes and replaces the aggregation calendar. | Always content. |
| `SetPanes` | Normalizes panes, restores the main pane, and reconciles declarative series. | Always content. |
| `AddSeries` | Rejects invalid identifiers, pane/source combinations, and invalid indicator parameters before mutation. | `kApplied` publishes content. |
| `RemoveSeries` | Removes the target and dependent derived series. | `true` publishes content. |
| `SetSeriesData` | Validates the complete replacement before mutation. Empty input clears existing data and is accepted when already empty. | A changed store publishes content. |
| `PrependSeriesData` | Validates the complete prefix and rejects overlap before mutation. Empty input is an accepted no-op. | A non-empty accepted prefix publishes content. |
| `UpdateSeriesData` | Replaces the last equal-timestamp point or appends a newer point. | `kApplied` publishes content. |
| `SetPaneHeight` | Rejects unknown panes, invalid weights, and equal weights. | `true` publishes content. |
| `SetPriceLine` | Adds or replaces a valid line; an identical line is a no-op. | `true` publishes content. |
| `RemovePriceLine` | Removes an existing identifier. | `true` publishes content. |
| `ClearPriceLines` | Clears a non-empty collection. | `true` publishes content. |
| `ResizePaneSeparator` | Applies a finite delta within adjacent minimum heights. | `true` publishes content. |
| `SetSize` | Clamps dimensions to zero; equal normalized dimensions are a no-op. | Changed dimensions publish content. |
| `SetHistory` | Validates the complete replacement before mutation. Empty input delegates to `Clear`. | `kApplied` publishes content. |
| `PrependHistory` | Validates the complete prefix and rejects overlap before mutation. Empty input is an accepted no-op. | A non-empty accepted prefix publishes content. |
| `UpdateCandle` | Replaces the last equal-timestamp candle, appends a newer candle, and ignores older candles. | `kApplied` publishes content. |
| `UpdateTrade` | Validates, applies session policy, and aggregates one trade. | `kApplied` publishes content. |
| `UpdateTrades` | Field validation and contextual reject validation complete before mutation. Old trades and off-session trades under the ignore policy are record-local. A batch with any applied trade returns `kApplied`. | A changed batch publishes content once. |
| `Clear` | Clears main and additional data and resets viewport scales while retaining configuration, panes, series definitions, and price-line definitions. | Always content. |
| `Pan` | Applies a finite permitted horizontal movement and clears an active crosshair. | `true` for any content or overlay change. |
| `Zoom` | Applies a finite positive permitted zoom around the focus and clears an active crosshair. | `true` for any content or overlay change. |
| `ZoomAtRightEdge` | Accepts a finite positive scale when a non-empty viewport exists. | Accepted calls publish content. |
| `ScaleY` / `ScaleYAt` | Applies permitted finite Y scaling to a non-RSI pane and clears an active crosshair. | `true` for any content or overlay change. |
| `ResetViewport` | Restores configured viewport and Y scales and clears the crosshair. | Always content. |
| `FitContent` | Fits the complete main store, restores Y scales, and clears the crosshair. | Always content. |
| `SetCrosshair` | Applies enabled, non-empty selection state and coordinates; an identical state is a no-op. | Changed state publishes overlay only. |

`PriceLines`, `PriceLineCount`, `PriceLineAt`, `SeparatorAt`, `YAxisValueAt`,
`CandleCount`, `CandleAt`, `Candles`, `Revision`, and `Snapshot` are reads.
`Snapshot` may build the dirty immutable snapshot but does not advance either
revision.

## `UpdateTrades` transaction boundary

Malformed fields, invalid calendar coverage, and an off-session record under
the reject policy reject the complete batch before candle mutation. Under the
ignore policy, an off-session record advances trade ordering state but does not
change render state. Old records are ignored before session evaluation.

The engine intentionally returns one aggregate status. If partial rejection
details become a product requirement, the protocol must introduce a structured
result instead of overloading `UpdateStatus`.

## Contract test requirements

The C++ contract suite covers every command in the command table. For each
transition it records the snapshot pointer, `revision`, `content_revision`, and
content vertex storage before and after the command. Tests cover successful
content changes, crosshair-only changes, and representative rejected/no-op
calls.

Provider fixtures and platform screenshot tests are separate conformance
layers. They may add coverage, but they do not replace this engine-level
protocol suite.
