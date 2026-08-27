# Agent Guide

This file applies to the entire repository. Read it before changing rendering,
the shared engine, native data transport, gestures, or performance-sensitive
code.

## Project purpose

`react-native-trading-charts` is a React Native New Architecture library for
native OHLC charts. React owns configuration and sends market data or commands;
native code owns chart state, gestures, snapshot construction, and rendering.
The library does not own networking.

The central design rule is: keep chart semantics and geometry in the shared C++
engine, and keep only platform rendering, lifecycle, gesture adapters, native
formatting, and React Native integration in the iOS and Android layers.

## Architecture map

- `src/TradingChartsView.native.tsx`: validates `chartId`, resolves config, and
  passes a memoized JSON config to the generated Fabric component. Unwraps all
  native events into plain payloads for public handlers.
- `src/TradingChartsViewNativeComponent.ts`: Fabric view codegen contract and
  the single source of truth for event payload types.
- `src/NativeTradingCharts.ts`: TurboModule command contract. The module is
  resolved lazily so importing the package never throws on non-native
  platforms.
- `src/TradingCharts.ts`: public imperative API. `addSeries` options are
  resolved/normalized in JS before crossing the bridge.
- `src/tradeBatcher.ts`: `createTradeBatcher`, the recommended way to feed
  high-frequency trade streams (one `updateTrades` call per interval).
- `cpp/chart_engine.{h,cc}`: shared candle store, trade aggregation, viewport,
  autoscale, ticks, crosshair selection, and snapshot publication.
- `cpp/internal/pane_layout.{h,cc}`: single source of truth for pane rects,
  shared by gesture hit-testing and the snapshot builder.
- `cpp/internal/render_snapshot_builder.{h,cc}`: immutable snapshot
  construction, visible-range computation, autoscale, ticks, and geometry
  tessellation (split into content and overlay vertex buffers).
- `cpp/internal/series_geometry.{h,cc}`: shared, allocation-free geometry
  strategies for candlestick, bar, and future price-series render types.
- `ios/TradingChartsView.mm`: Fabric view, gestures, on-demand frame scheduling,
  Metal renderer, and Core Animation text overlay.
- `ios/TradingChartsRegistry.mm`: main-thread command routing and bounded
  pending-command replay for views identified by `chartId`.
- `android/src/main/cpp/chart_engine_jni.cc`: JNI bridge to the shared engine and
  snapshot serialization.
- `android/src/main/java/com/tradingcharts/TradingChartsView.kt`: native view,
  gestures, frame coalescing, and lifecycle.
- `android/src/main/java/com/tradingcharts/ChartRenderer.kt`: GLES3 plot renderer.
- `android/src/main/java/com/tradingcharts/ChartOverlayView.kt`: Canvas text,
  badges, and tooltip overlay.
- `android/src/main/java/com/tradingcharts/TradingChartsRegistry.kt`: Android
  equivalent of the iOS registry.
- `cpp/tests/chart_engine_test.cc`: platform-independent behavior tests.

## End-to-end data and frame flow

1. JavaScript calls the TurboModule using a stable, unique `chartId`.
2. The platform registry dispatches on the main thread. If the Fabric view is
   not mounted, it retains commands and replays them when the view registers.
   A queued `setHistory` replaces older queued work. Pending queues are
   bounded; the oldest streaming commands (candle/trade batches) are dropped
   first so an unmounted view cannot grow memory without limit.
3. The native view mutates its `ChartEngine`; the engine increments `revision_`
   and marks its cached snapshot dirty.
4. The native view requests one frame. Repeated requests before the next vsync
   are coalesced. Data and gesture handlers request frames only when the
   engine reports an actual state change.
5. `ChartEngine::snapshot()` builds an immutable `RenderSnapshot` only when
   dirty; otherwise it returns the cached `shared_ptr`. When only crosshair
   state changed (`content_revision` unchanged), the builder copies the
   previous snapshot, shares its content vertex buffer without copying, and
   rebuilds only the crosshair overlay.
6. The GPU renderer consumes `content_vertices` and `overlay_vertices` from
   the same snapshot in two draws; the native overlay consumes ticks and
   metadata. `content_vertices` is re-uploaded only when `content_revision`
   changes; `overlay_vertices` follows every revision.
7. Visible-range events are emitted only when the first index, last index, or
   total candle count changes, and only while `has_visible_candles` is true.
   Preserve this guard to avoid unnecessary JS traffic.

## Shared C++ engine invariants

- Candle timestamps are milliseconds and must be non-decreasing. Empty time
  buckets are not synthesized. Older trades are ignored.
- `ChartEngine` is mutex-protected. Do not expose mutable candle or snapshot
  storage outside the lock.
- `RenderSnapshot` is immutable after publication. Preserve its lifetime until
  both the GPU and overlay have finished consuming it.
- `revision` identifies all render-relevant state. Any state mutation that
  changes output must call `markDirtyLocked()`.
- Geometry is interleaved as six floats per vertex: `x, y, r, g, b, a`, and is
  rendered as triangles. iOS and Android must keep this contract identical.
- A snapshot carries two vertex buffers. `content_vertices` (grid, series,
  pane separators, current price) changes only with `content_revision` and is
  shared between consecutive snapshots; `overlay_vertices` (crosshair) is
  rebuilt with every revision. Renderers upload and draw the two buffers
  separately. `content_vertices` is null when there is no drawable content.
- Series types tessellate into that common triangle list. Keep style selection
  in shared C++ and avoid platform-specific candle/bar geometry or GPU line
  primitives.
- Pane rects come from `internal::ComputePaneRects`, used identically by
  gesture hit-testing and the snapshot builder. Do not re-implement pane
  layout elsewhere.
- A viewport that contains no candles (a data gap) yields an honest empty
  visible range: `has_visible_candles` is false, `last_visible_index` is
  `first_visible_index - 1`, autoscale anchors to the adjacent candles, and
  platforms suppress visible-range events. Do not fall back to scanning the
  whole store.
- The engine operates in native view coordinates. iOS uses points with the
  default `displayScale` of 1. Android uses pixels and passes density as
  `displayScale`, so physical tick density stays comparable.
- `time` spacing represents elapsed milliseconds; `logical` spacing represents
  candle indices while tick values remain timestamps.
- Autoscale, scale margins, `minMove`, visible-index calculation, and tick
  generation are shared behavior. Fix cross-platform semantic differences in
  C++ whenever possible.
- Adding config or snapshot fields requires coordinated changes to the TypeScript
  types/config resolver, iOS JSON decoding, Android `ChartConfig`, JNI array
  indices, and Android `ChartSnapshot`. JNI numeric arrays are positional ABI
  contracts; never reorder them casually.

## iOS rendering

### Frame scheduling and Metal

- `TCChartHostView` owns one engine, a paused `MTKView`, an overlay, and a
  `CADisplayLink`.
- Rendering is on demand. `requestFrame` coalesces requests; each display-link
  callback immediately pauses the link again. Momentum explicitly schedules the
  next frame. Do not convert this to an always-running display link.
- Gesture and data handlers call `requestFrame` only when the engine reports a
  state change (`Pan`/`Zoom`/`ScaleYAt` return values, `UpdateStatus::kApplied`).
- The display-link callback obtains one snapshot, assigns the same `shared_ptr`
  to Metal and the overlay, and calls `MTKView.draw` only when the snapshot
  revision differs from the last drawn one (forced after window re-attach and
  `applicationDidBecomeActive`).
- `TCMetalRenderer` keeps two grow-only shared vertex buffers. Content is
  copied only when `content_revision` changes; the small crosshair overlay
  buffer follows every revision. Preserve revision-based uploads and capacity
  reuse.
- `currentDrawable` / `currentRenderPassDescriptor` acquisition may represent
  GPU or presentation pacing. Time spent in `Metal Acquire Drawable` is not by
  itself evidence of CPU computation; use Metal System Trace before changing
  this path.

### Core Animation overlay

The overlay intentionally does not redraw all text in `drawRect:`. It uses
container `CALayer`s and reusable `CATextLayer`s for axes, badges, and tooltips.
Keep these properties:

- `CATransaction` actions are disabled for render-driven updates.
- Number/date formatters are rebuilt only when their config keys change.
- Formatted value/time strings and measured attributed-string layouts are
  cached. Cache invalidation must follow locale, timezone, precision, compact
  mode, grouping, currency, font, and color changes.
- X and Y layers are pools; hide unused layers rather than destroying them.
- `applyLayout` changes `CATextLayer.string` only when the cached layout identity
  changes. Frame-only movement must not reassign attributed text.
- Static layer properties (badge borders, corner radii) are re-applied only
  when the presentation version changes, and `hidden`/`zPosition` writes are
  guarded by their current value. Do not reintroduce unconditional property
  writes into per-frame paths.
- X/Y presentation reconciliation is deliberately two-pass. First reserve every
  unused layer whose cached `TCTextLayout` already matches a requested label;
  then assign unmatched labels to remaining layers. This prevents an index-shift
  cascade such as `[A, B, C] -> [D, A, B]` from causing three text updates.
  Do not replace it with index-based assignment or a greedy one-pass algorithm.
- If the same snapshot revision is applied again, the overlay returns without
  touching layers.

### iOS performance history and diagnostics

The following optimizations were measured in Release on a physical iPhone 15
Pro during repeated approximately 20-second horizontal scrolls:

1. Replaced per-frame overlay `drawRect:` text drawing with pooled Core
   Animation layers.
2. Added formatter, formatted-string, and text-layout caches.
3. Added revision checks and mutation guards for text, frame, colors, and
   visibility.
4. Added two-pass identity reconciliation for X/Y text layers.

The identity pool reduced text updates per frame by about 82%, overlay mean time
by about 46%, overlay p95 by about 52%, Core Animation layer CPU by about 61%,
and main-thread CPU by about 18% relative to the prior diagnostic build.
Consequently, preserve the pool and cache invariants unless a new equivalent
benchmark demonstrates a better design.

The `com.tradingcharts` / `Rendering` signposts are intentional:

- `Display Link Frame`
- `ChartEngine Snapshot`
- `Overlay Update Layers`
- `Overlay Selection Update`
- `Overlay Transaction Commit`
- `Metal Acquire Drawable`
- `Metal Vertex Memcpy`
- `Metal Encode Commit`

`Overlay Update Layers` reports `visible`, `textUpdates`, `xTextUpdates`,
`yTextUpdates`, `layoutCacheHits`, `layoutCacheMisses`, `layerReassignments`, and
`frameUpdates`. Keep payload semantics stable so traces remain comparable.
`Overlay Selection Update` isolates time-badge and tooltip work when the selected
candle changes. `Overlay Transaction Commit` isolates the Core Animation commit
from layer preparation. Keep both nested inside `Overlay Update Layers`.
Diagnostics are instrumentation, not application behavior.

Current residual work is mostly layer frame mutation and occasional batches of
Y-label changes when autoscale changes the tick set. A possible future experiment
is a separate X-axis container translated as a group between tick-set changes.
Do not implement it without profiling and visual tests. Rendering all text in a
Metal glyph atlas is a larger architectural change, not a routine optimization.

## Android rendering

- `TradingChartsView` owns the JNI engine handle, a GLES3 `GLSurfaceView`, and a
  transparent Canvas overlay.
- `GLSurfaceView` must remain `RENDERMODE_WHEN_DIRTY`. `scheduleFrame` uses an
  `AtomicBoolean` plus `postOnAnimation` to coalesce UI-thread work, then updates
  both renderers and calls `requestRender()`.
- The frame callback first reads the engine revision through a cheap JNI call
  (`nativeEngineRevision`) and skips the whole snapshot marshal when neither
  the revision nor a pending event flag changed. Data handlers schedule frames
  only on `UpdateStatus` applied.
- Fling uses `OverScroller` and `postOnAnimation`; stop it on new input,
  visibility loss, detach, and disposal. A React `LifecycleEventListener`
  forwards host pause/resume to the `GLSurfaceView`.
- `ChartEngineNative.snapshot()` acquires a native `shared_ptr`, copies metadata,
  ticks, and the small overlay array into JVM-owned objects, and releases the
  holder in `finally`. Preserve the acquire/release pairing. When
  `contentRevision` changes, JNI copies content geometry directly into one of
  three bounded, grow-only direct-buffer slots. Crosshair-only frames reuse the
  existing slot and skip the large copy.
- `ChartRenderer.submit()` transfers the newest frame from the UI thread to the
  GL thread through a synchronized single-frame mailbox. Replacing a pending
  frame must release its content-buffer lease; a metadata-only replacement with
  the same `contentRevision` inherits that lease.
- GLES owns two grow-only VBO slots. Content uploads consume the pooled direct
  buffer without a Java `FloatArray` or second staging copy; the small overlay
  array still uses a grow-only direct staging buffer. The renderer retains the
  latest content lease so it can restore the VBO after EGL recreation. Content
  uploads follow `contentRevision`, overlay follows `revision`.
  Cached upload revisions must be reset in `onSurfaceCreated`: GLSurfaceView
  destroys the EGL context on pause, and stale revisions would draw from
  buffers that no longer exist.
- The Android overlay uses `Canvas.drawText`, persistent `Paint` objects, and
  formatter reuse keyed by config. It re-applies without invalidation when the
  snapshot revision is unchanged, caches measured axis/badge labels by value
  bits (cleared on config change), and reuses scratch `RectF`/`Date` objects
  instead of allocating in `onDraw`. The iOS `CATextLayer` pool cannot be
  copied directly to Android; further work would involve a platform-appropriate
  text layer/atlas.
- Android sizes are pixels. Do not mix dp and px: JSON dimensions are scaled in
  `ChartConfig.fromJson`, while engine and gesture coordinates use pixels.

## Performance rules for future changes

- Measure first and compare the same interaction, device, build configuration,
  data set, and duration. Prefer three Release runs on a physical device.
- For iOS scrolling, record Time Profiler plus Animation Hitches, Allocations,
  and Metal System Trace when GPU/presentation behavior matters.
- For Android, use Android Studio CPU/Memory Profiler and GPU rendering tools;
  inspect UI, GL, and RenderThread separately.
- Report distributions (`p50`, `p95`, `p99`) and per-second CPU work, not only
  one heaviest stack or a single maximum.
- Distinguish CPU time, GPU time, and waits. A native method's inclusive CPU
  samples are not GPU duration.
- Avoid allocations, formatter creation, text measurement, JNI array creation,
  and GPU buffer growth in steady-state frame loops.
- Preserve on-demand rendering. Data updates and gestures should request frames;
  an idle chart should not continuously consume CPU/GPU.
- Keep visible output and gesture semantics identical when optimizing. Verify
  axis labels, current-price badge, crosshair, tooltip, pan, pinch/Y scaling,
  momentum, lifecycle resume, and both axis sides.
- Do not infer that an optimization from one platform applies to the other;
  they share snapshots but use different text and GPU stacks.

## Validation

After completing all edits and before reporting the work as done, always run
the repository-wide TypeScript/JavaScript checks:

```sh
yarn typecheck
yarn lint
```

If any C++ header or source file changed, including JNI code under
`android/src/main/cpp`, run the full CI-equivalent C++ validation:

```sh
yarn lint:cpp
yarn tidy:cpp
yarn test:cpp
```

`yarn lint:cpp` checks clang-format and cpplint; it does not run clang-tidy.
`yarn tidy:cpp` is therefore a separate mandatory check and must not be
omitted. If formatting fails, use `yarn format:cpp`, review the resulting diff,
and rerun all three C++ commands.

If any Kotlin source under `android/src/main/java` changed, run the
CI-equivalent Kotlin validation:

```sh
yarn lint:kotlin
```

This command runs both detekt and the ktfmt formatting check. If formatting
fails, use `yarn format:kotlin`, review the resulting diff, and rerun
`yarn lint:kotlin`.

These lint, static-analysis, formatting, type, and applicable native test
checks are mandatory after every applicable change, not optional or merely
proportionate. Do not report completion while they are failing. If a required
check cannot be run, report the exact command and blocker.

Run tests proportionate to the change:

```sh
yarn test
```

`yarn test:cpp` is already mandatory for every C++ change as specified above.

Native changes require rebuilding the example application:

```sh
yarn example ios
yarn example android
```

For focused native verification, build the iOS workspace
`example/ios/TradingChartsExample.xcworkspace` and use
`example/android/gradlew` from the `example/android` directory. Test Release on
a physical device before accepting performance conclusions.

Preserve unrelated working-tree changes. Do not edit generated build outputs
under `android/build`, `android/.cxx`, or generated CocoaPods data.
