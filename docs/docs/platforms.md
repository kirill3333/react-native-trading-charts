---
description: 'Check native platform requirements and chart limitations before integrating the library.'
---

# Platform support & limitations

This library contains native iOS and Android code and targets React Native's New Architecture (Fabric). Check the requirements below before adding it to an app, especially if the app still uses the old architecture or must support older OS versions.

You need a native build that includes the package. Installing the JavaScript dependency alone cannot add its native renderer to an already built app. The table also lists constraints that affect chart design, such as one visible price scale per pane and fonts bundled by the app.

| Property                  | Supported value                                              | Notes                                                                         |
| ------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Platforms                 | iOS and Android                                              | Metal on iOS; OpenGL ES 3 on Android.                                         |
| React Native              | 0.80 or newer                                                | React Native is a peer dependency.                                            |
| React Native architecture | New Architecture / Fabric                                    | The first release targets Fabric applications.                                |
| Minimum OS                | iOS 15.1; Android 7.0 (API 24)                               | Matches the minimum platform versions supported by React Native 0.80.         |
| iOS toolchain             | Xcode 15 or newer; Swift 5.9 or newer                        | Direct Swift/C++ interop is private to the pod target.                        |
| Data ownership            | Application-owned                                            | Networking, WebSockets, parsing, and reconnect logic are outside the library. |
| Time unit                 | Milliseconds                                                 | Candle timestamps must be safe integers.                                      |
| Price scales              | One visible scale per pane                                   | Each pane keeps an independent autoscale range.                               |
| Custom fonts              | App-bundled fonts                                            | Missing families fall back to the platform monospace font.                    |
| Main identifiers          | `paneId: 'main'`, `priceScaleId: 'main'`, `seriesId: 'main'` | Reserved and cannot be reused or removed.                                     |
| Native coordinates        | iOS points, Android pixels internally                        | Public dimensions are converted consistently by the platform configuration.   |

Changing the main `series.type` at runtime keeps the native candle store,
viewport, Y scale, and crosshair selection. The library does not create candles
for intervals with no trades.
