import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import { type Theme } from 'vitepress';
import panels from '../../../assets/panels.png';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'home-hero-image': () =>
        h('img', {
          src: panels,
          class: 'chart-preview',
          alt: 'Trading chart with candlesticks, volume and RSI in separate panes',
          width: 1206,
          height: 2622,
          fetchpriority: 'high',
        }),
    }),
} satisfies Theme;
