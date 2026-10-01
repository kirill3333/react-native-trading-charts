# Example performance monitor (iOS and Android)

This module belongs to the example app. It is not exported by the chart package.
The synthetic chart screen subscribes while focused and active, at one-second
intervals. Unsubscribing stops native work when the last subscriber leaves.

```ts
import { getThreads, subscribe, JS_THREAD_NAME } from './performance';

const threads = await getThreads();
const subscription = subscribe(
  {
    chartId: 'your-mounted-chart-id',
    includeMainThread: true,
    threadNames: [JS_THREAD_NAME],
    intervalMs: 1000,
  },
  (sample) => {
    // Consume sample.threads, sample.uiFPS, sample.metalFPS and sample.glFPS.
  }
);

subscription.remove();
```

- `getThreads()` returns system thread names, string IDs, and Main/JS flags.
  Names match exactly. Duplicate names produce separate rows; unnamed threads
  still appear in the list. `includeMainThread` defaults to true.
- `cpuPercent` measures CPU time divided by elapsed time: 100% is one CPU busy
  for the whole interval. JS refers to `com.facebook.react.runtime.JavaScript` on iOS and `mqt_v_js`
  on Android RN 0.85, not Hermes background workers. `JS_THREAD_NAME` selects
  the platform name. Android identifies the JS thread by its native TID captured
  on the React Native JS queue. A new thread or failed CPU read returns null;
  missing requested names are listed in `missingThreadNames`.
- `timestamp` is native monotonic host time in seconds, not a Unix timestamp.
  `intervalMs` is the actual measurement window, including timer delays.
- `uiFPS` counts main-thread `CADisplayLink` (iOS) or `Choreographer` (Android) callbacks divided by the actual
  measurement interval. It estimates UI thread responsiveness, not actual
  compositor presentations or JS throughput. A stalled main thread contributes
  zero callbacks. On iOS the link requests the screen's maximum rate; the OS may choose a
  lower rate (for example, in Low Power Mode). It also works in Simulator.
  Until a complete observation window is available, the value is null.
- `presentedFrames` and `metalFPS` count actual Metal presentations for `chartId`.
  A connected idle chart reports zero. A disconnected chart reports null.
  The iOS Simulator SDK does not expose Metal presentation callbacks: Metal FPS is
  unavailable there; CPU metrics remain available. Test Metal FPS on a physical device.
- The first CPU sample establishes a baseline. Background/resume and chart
  attachment start fresh windows. The UI uses `—` for unavailable values.
- Intervals must be finite and at least 250 ms. Each subscription is independent.
  Native sampling continues when JS is busy, but delivery retains at most one
  unacknowledged event and one latest pending sample per subscription. The client
  acknowledges automatically. This API provides live metrics, not a full trace.
- `renderedFrames` and `glFPS` count completed OpenGL ES draw callbacks for the
  selected Android chart. These are CPU-side submissions, not GPU completion or
  confirmed screen presentations. An idle connected chart reports zero; a detached,
  paused, or newly recreated surface reports null until a full window is available.
- `glThread` contains the Android chart renderer's thread metadata and CPU percent.
  This measures the GL thread's CPU work, not GPU utilization. Android reads each
  thread's `/proc/self/task/<tid>/stat`; CPU baselines use TID plus thread start time.
  System thread names may be truncated by the kernel; matching uses the returned name.
- Android reports null for Metal fields; iOS reports null for GL fields.
- Environments without the native module return an empty thread list and an inert
  subscription; the panel is hidden.

The example Podfile enables `TRADING_CHARTS_EXAMPLE_DIAGNOSTICS` in Debug and
Release only for its TradingCharts pod. The conditional native transport attaches
presentation callbacks only while observed. Normal library builds contain no
hook. The example monitor runs one shared diagnostic display link while there
are active subscriptions. It stops in the background and on last unsubscribe or
module invalidation. This adds main-thread wakeups while monitoring; it never
requests chart draws. The chart remains demand-driven.

The Android example enables the Gradle property
`TRADING_CHARTS_EXAMPLE_DIAGNOSTICS=true` for both Debug and Release. The library
property defaults to false. When disabled, no renderer diagnostic owner is created
and GL observations are unavailable. While enabled, counters only advance for
observed charts. The example shares one diagnostic Choreographer callback across
subscriptions and removes it on pause, invalidation, and last unsubscribe.
OpenGL remains `RENDERMODE_WHEN_DIRTY`; observing it never requests draws.

Rebuild the native example after Codegen contract changes. Android displays three
CPU metrics and two FPS metrics; iOS retains its four existing metrics.
