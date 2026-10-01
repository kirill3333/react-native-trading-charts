import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'en-US',
  title: 'React Native Trading Charts',
  description:
    'Native GPU charts for live and historical market data on iOS and Android.',
  themeConfig: {
    nav: [
      {
        text: 'Home',
        link: '/',
      },
      {
        text: 'Docs',
        link: '/docs/introduction',
        activeMatch: '^/docs/',
      },
      {
        text: 'npm',
        link: 'https://www.npmjs.com/package/react-native-trading-charts',
      },
    ],
    sidebar: {
      '/docs/': [
        {
          text: 'Getting started',
          collapsed: false,
          items: [
            {
              text: 'Introduction',
              link: '/docs/introduction',
            },
            {
              text: 'Installation & first chart',
              link: '/docs/getting-started',
            },
          ],
        },
        {
          text: 'Working with charts',
          collapsed: false,
          items: [
            {
              text: 'Data & streaming',
              link: '/docs/data',
            },
            {
              text: 'Series types',
              link: '/docs/series-types',
            },
            {
              text: 'Additional series',
              link: '/docs/additional-series',
            },
            {
              text: 'Panes',
              link: '/docs/panes',
            },
            {
              text: 'Time & trade aggregation',
              link: '/docs/time-aggregation',
            },
          ],
        },
        {
          text: 'Features',
          collapsed: false,
          items: [
            {
              text: 'Custom price markers',
              link: '/docs/price-markers',
            },
            {
              text: 'Volume & histograms',
              link: '/docs/volume',
            },
            {
              text: 'SMA & EMA',
              link: '/docs/moving-averages',
            },
            {
              text: 'RSI',
              link: '/docs/rsi',
            },
            {
              text: 'MACD',
              link: '/docs/macd',
            },
            {
              text: 'Crosshair & tooltips',
              link: '/docs/crosshair',
            },
            {
              text: 'Current price & extremes',
              link: '/docs/price-overlays',
            },
          ],
        },
        {
          text: 'Customization',
          collapsed: false,
          items: [
            {
              text: 'Themes & appearance',
              link: '/docs/styling',
            },
            {
              text: 'Axes & formatting',
              link: '/docs/axes',
            },
            {
              text: 'Gestures & viewport',
              link: '/docs/gestures',
            },
          ],
        },
        {
          text: 'API reference',
          collapsed: false,
          items: [
            {
              text: 'TradingChartsView',
              link: '/docs/api/view',
            },
            {
              text: 'TradingCharts',
              link: '/docs/api/commands',
            },
            {
              text: 'Trade batcher',
              link: '/docs/api/trade-batcher',
            },
            {
              text: 'Events',
              link: '/docs/api/events',
            },
            {
              text: 'Types',
              link: '/docs/api/types',
            },
          ],
        },
        {
          text: 'Fundamentals',
          collapsed: false,
          items: [
            {
              text: 'Architecture & performance',
              link: '/docs/architecture',
            },
            {
              text: 'Platform support & limitations',
              link: '/docs/platforms',
            },
          ],
        },
      ],
    },
    outline: [2, 3],
    search: {
      provider: 'local',
    },
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/kirill3333/react-native-trading-charts',
      },
    ],
    footer: {
      message: 'Released under the MIT License.',
    },
  },
});
