import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';

import { useSyntheticDataFeed } from '../hooks/useSyntheticDataFeed';
import { type SyntheticFeedApi } from '../synthetic/feed';
import {
  DEFAULT_SYNTHETIC_SETTINGS,
  type SyntheticSettings,
} from '../synthetic/settings';

const charts = {
  setHistory: jest.fn<SyntheticFeedApi['setHistory']>(),
  updateTrades: jest.fn<SyntheticFeedApi['updateTrades']>(),
};

type HarnessProps = { settings: SyntheticSettings };

function Harness({ settings }: HarnessProps) {
  useSyntheticDataFeed('synthetic-hook', settings, charts);
  return null;
}

describe('synthetic feed lifecycle', () => {
  const initialState = AppState.currentState;
  let renderer: ReactTestRenderer | undefined;
  let notifyState: (state: AppStateStatus) => void;
  const remove = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers({ now: 1_800_000_000_000 });
    jest.clearAllMocks();
    AppState.currentState = 'active';
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        notifyState = listener;
        return { remove };
      });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    AppState.currentState = initialState;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('streams while mounted, pauses in background, and cleans up on unmount', () => {
    act(() => {
      renderer = create(
        <Harness settings={DEFAULT_SYNTHETIC_SETTINGS} />
      );
    });
    act(() => jest.advanceTimersByTime(100));
    expect(charts.setHistory).toHaveBeenCalledTimes(1);
    act(() => {
      renderer?.update(
        <Harness settings={DEFAULT_SYNTHETIC_SETTINGS} />
      );
    });
    charts.updateTrades.mockClear();
    act(() => jest.advanceTimersByTime(5_000));
    const trades = charts.updateTrades.mock.calls.flatMap((call) => call[1]);
    expect(trades).toHaveLength(50);
    for (let index = 1; index < trades.length; index += 1) {
      expect(trades[index]!.timestamp - trades[index - 1]!.timestamp).toBe(100);
    }
    charts.updateTrades.mockClear();
    act(() => {
      renderer?.update(
        <Harness settings={DEFAULT_SYNTHETIC_SETTINGS} />
      );
    });
    act(() => jest.advanceTimersByTime(100));
    expect(charts.updateTrades).toHaveBeenCalledTimes(1);
    act(() => {
      notifyState('background');
    });
    charts.updateTrades.mockClear();
    act(() => jest.advanceTimersByTime(60_000));
    expect(charts.updateTrades).not.toHaveBeenCalled();
    act(() => {
      notifyState('active');
    });
    act(() => jest.advanceTimersByTime(100));
    expect(
      charts.updateTrades.mock.calls.flatMap((call) => call[1])
    ).toHaveLength(1);
    expect(charts.setHistory).toHaveBeenCalledTimes(1);
    act(() => renderer?.unmount());
    renderer = undefined;
    expect(jest.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalled();
  });

  it('cancels pending history when new settings are applied and uses no network', () => {
    const fetch = jest.spyOn(global, 'fetch');
    const websocket = jest.spyOn(global, 'WebSocket');
    act(() => {
      renderer = create(
        <Harness
          settings={{ ...DEFAULT_SYNTHETIC_SETTINGS, candleCount: 100_000 }}
        />
      );
    });
    act(() => jest.advanceTimersByTime(0));
    expect(charts.setHistory).not.toHaveBeenCalled();
    act(() => {
      renderer?.update(
        <Harness
          settings={{
            ...DEFAULT_SYNTHETIC_SETTINGS,
            candleCount: 2,
            intensity: 0,
          }}
        />
      );
    });
    act(() => jest.advanceTimersByTime(1_000));
    expect(charts.setHistory).toHaveBeenCalledTimes(1);
    expect(charts.setHistory.mock.calls[0]?.[1]).toHaveLength(2);
    expect(
      charts.updateTrades.mock.calls.flatMap((call) => call[1])
    ).toHaveLength(10);
    expect(fetch).not.toHaveBeenCalled();
    expect(websocket).not.toHaveBeenCalled();
  });

  it('defers work when mounted in background and starts on app activation', () => {
    AppState.currentState = 'background';
    act(() => {
      renderer = create(
        <Harness settings={DEFAULT_SYNTHETIC_SETTINGS} />
      );
    });
    act(() => jest.advanceTimersByTime(1_000));
    expect(charts.setHistory).not.toHaveBeenCalled();
    act(() => {
      notifyState('active');
    });
    act(() => jest.advanceTimersByTime(100));
    expect(charts.setHistory).toHaveBeenCalledTimes(1);
  });
});
