---
layout: home
hero:
  name: React Native Trading Charts
  text: Native charts for live markets
  tagline: Draw historical prices and live trades in your React Native app. Add indicators, arrange panes and style the chart for your screen.
  actions:
    - theme: brand
      text: Get Started
      link: /docs/getting-started
    - theme: alt
      text: Explore Docs
      link: /docs/introduction
features:
  - title: Native GPU rendering
    details: A shared C++ engine handles chart data and geometry. Metal on iOS and OpenGL ES 3 on Android draw frames when the chart changes.
    link: /docs/architecture
  - title: Streaming market data
    details: Load an initial history, then send new candles or raw trades as they arrive. The trade batcher groups frequent messages into fewer native calls.
    link: /docs/data
  - title: Flexible chart layouts
    details: Keep price in the main pane and give volume or indicators their own scales. Add SMA, EMA, RSI or MACD, then choose the colors and labels your screen needs.
    link: /docs/panes
---
