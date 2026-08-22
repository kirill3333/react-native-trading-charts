import { type NetInfoState } from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';

import {
  BINANCE_WEBSOCKET_URL,
  parseBinanceWebSocketEnvelope,
  type BinanceMarketMessage,
} from './binance';

const OPEN_TIMEOUT_MS = 10_000;
const SUBSCRIBE_TIMEOUT_MS = 10_000;
const STABLE_CONNECTION_MS = 30_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const SOCKET_OPEN = 1;
const SOCKET_CLOSING = 2;

export type BinanceWebSocketState =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'paused' | 'offline';

export type BinanceWebSocketEvent =
  | { type: 'state'; state: BinanceWebSocketState; error: string | null }
  | { type: 'ready'; topic: string; generation: number }
  | {
      type: 'message';
      topic: string;
      generation: number;
      message: BinanceMarketMessage;
    };

export type BinanceWebSocketListener = (event: BinanceWebSocketEvent) => void;

type WebSocketLike = {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  send(data: string): void;
  close(): void;
};

type AppStateSource = {
  currentState: string | null | undefined;
  addEventListener(
    event: 'change',
    listener: (state: AppStateStatus) => void
  ): { remove(): void };
};

type NetInfoSource = {
  addEventListener(listener: (state: NetInfoState) => void): () => void;
};

const defaultNetInfoSource: NetInfoSource = {
  addEventListener(listener) {
    const netInfoModule: {
      default: NetInfoSource;
    } = require('@react-native-community/netinfo');
    return netInfoModule.default.addEventListener(listener);
  },
};

export type BinanceWebSocketClientOptions = {
  url?: string;
  createSocket?: (url: string) => WebSocketLike;
  appState?: AppStateSource;
  netInfo?: NetInfoSource;
  random?: () => number;
};

type TopicSubscription = {
  listeners: Set<BinanceWebSocketListener>;
  readyGeneration: number | null;
};

type PendingSubscription = {
  topic: string;
  timer: ReturnType<typeof setTimeout>;
};

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export class BinanceWebSocketClient {
  private readonly url: string;
  private readonly createSocket: (url: string) => WebSocketLike;
  private readonly appState: AppStateSource;
  private readonly netInfo: NetInfoSource;
  private readonly random: () => number;
  private readonly topics = new Map<string, TopicSubscription>();
  private readonly pendingSubscriptions = new Map<
    string,
    PendingSubscription
  >();
  private socket: WebSocketLike | null = null;
  private state: BinanceWebSocketState = 'idle';
  private stateError: string | null = null;
  private generation = 0;
  private requestSequence = 0;
  private reconnectAttempt = 0;
  private appIsActive = true;
  private networkIsReachable = true;
  private eligibleToConnect = false;
  private appStateSubscription: { remove(): void } | null = null;
  private netInfoUnsubscribe: (() => void) | null = null;
  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private closeFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private failureReason: string | null = null;

  constructor(options: BinanceWebSocketClientOptions = {}) {
    this.url = options.url ?? BINANCE_WEBSOCKET_URL;
    // SAFETY: WebSocketLike is the exact mutable subset of the standard
    // WebSocket instance used by this client.
    this.createSocket =
      options.createSocket ?? ((url) => new WebSocket(url) as WebSocketLike);
    this.appState = options.appState ?? AppState;
    this.netInfo = options.netInfo ?? defaultNetInfoSource;
    this.random = options.random ?? Math.random;
  }

  subscribe(topic: string, listener: BinanceWebSocketListener): () => void {
    let subscription = this.topics.get(topic);
    const isFirstTopic = this.topics.size === 0;
    if (subscription == null) {
      subscription = { listeners: new Set(), readyGeneration: null };
      this.topics.set(topic, subscription);
    }
    subscription.listeners.add(listener);

    if (isFirstTopic) {
      this.startLifecycleMonitoring();
    } else {
      listener({ type: 'state', state: this.state, error: this.stateError });
      if (
        subscription.readyGeneration === this.generation &&
        this.socket?.readyState === SOCKET_OPEN
      ) {
        listener({ type: 'ready', topic, generation: this.generation });
      } else if (
        subscription.listeners.size === 1 &&
        this.socket?.readyState === SOCKET_OPEN
      ) {
        this.sendSubscribe(topic, this.socket, this.generation);
      }
    }

    let subscribed = true;
    return () => {
      if (subscribed) {
        subscribed = false;
        this.unsubscribe(topic, listener);
      }
    };
  }

  retry(): void {
    this.reconnectAttempt = 0;
    this.clearReconnectTimer();
    this.closeCurrentSocket();
    this.ensureConnection();
  }

  reportProtocolError(generation: number, cause: unknown): void {
    if (generation !== this.generation || this.socket == null) {
      return;
    }
    this.failSocket(
      this.socket,
      generation,
      `Invalid Binance stream data: ${errorMessage(cause)}`
    );
  }

  private unsubscribe(topic: string, listener: BinanceWebSocketListener): void {
    const subscription = this.topics.get(topic);
    if (subscription == null) {
      return;
    }
    subscription.listeners.delete(listener);
    if (subscription.listeners.size > 0) {
      return;
    }

    this.clearPendingSubscriptionForTopic(topic);
    this.topics.delete(topic);
    if (this.topics.size === 0) {
      this.clearReconnectTimer();
      this.closeCurrentSocket();
      this.stopLifecycleMonitoring();
      this.state = 'idle';
      this.stateError = null;
      return;
    }

    const socket = this.socket;
    if (socket?.readyState === SOCKET_OPEN) {
      socket.send(
        JSON.stringify({
          method: 'UNSUBSCRIBE',
          params: [topic],
          id: this.nextRequestId('unsub'),
        })
      );
    }
  }

  private startLifecycleMonitoring(): void {
    const currentState = this.appState.currentState;
    this.appIsActive =
      currentState == null ||
      (currentState !== 'background' && currentState !== 'inactive');
    this.networkIsReachable = true;
    this.eligibleToConnect = false;
    this.appStateSubscription = this.appState.addEventListener(
      'change',
      (nextState) => {
        this.appIsActive = nextState === 'active';
        this.handleEligibilityChange();
      }
    );
    this.netInfoUnsubscribe = this.netInfo.addEventListener((netInfo) => {
      this.networkIsReachable = !(
        netInfo.isConnected === false || netInfo.isInternetReachable === false
      );
      this.handleEligibilityChange();
    });
    this.handleEligibilityChange();
  }

  private stopLifecycleMonitoring(): void {
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    this.netInfoUnsubscribe?.();
    this.netInfoUnsubscribe = null;
    this.eligibleToConnect = false;
  }

  private handleEligibilityChange(): void {
    if (this.topics.size === 0) {
      return;
    }
    const nextEligible = this.appIsActive && this.networkIsReachable;
    const becameEligible = !this.eligibleToConnect && nextEligible;
    this.eligibleToConnect = nextEligible;
    if (!nextEligible) {
      this.clearReconnectTimer();
      this.closeCurrentSocket();
      this.emitState(this.appIsActive ? 'offline' : 'paused', null);
      return;
    }
    if (becameEligible) {
      this.reconnectAttempt = 0;
      this.clearReconnectTimer();
      this.ensureConnection();
    }
  }

  private canConnect(): boolean {
    if (this.topics.size === 0 || !this.appIsActive) {
      return false;
    }
    if (!this.networkIsReachable || this.socket != null) {
      return false;
    }
    return this.reconnectTimer == null;
  }

  private ensureConnection(): void {
    if (!this.canConnect()) {
      return;
    }

    this.emitState('connecting', null);
    const generation = this.generation + 1;
    this.generation = generation;
    this.failureReason = null;
    let socket: WebSocketLike;
    try {
      socket = this.createSocket(this.url);
    } catch (error) {
      this.scheduleReconnect(errorMessage(error));
      return;
    }
    this.socket = socket;
    this.openTimer = setTimeout(() => {
      this.failSocket(socket, generation, 'WebSocket connection timed out');
    }, OPEN_TIMEOUT_MS);

    socket.onopen = () => {
      if (!this.isCurrent(socket, generation)) {
        return;
      }
      this.clearOpenTimer();
      for (const topic of this.topics.keys()) {
        this.sendSubscribe(topic, socket, generation);
      }
    };

    socket.onmessage = (event) => {
      if (!this.isCurrent(socket, generation)) {
        return;
      }
      try {
        this.handleMessage(
          parseBinanceWebSocketEnvelope(event.data),
          socket,
          generation
        );
      } catch (error) {
        this.failSocket(
          socket,
          generation,
          `Invalid WebSocket message: ${errorMessage(error)}`
        );
      }
    };

    socket.onerror = () => {
      this.failSocket(socket, generation, 'WebSocket connection error');
    };
    socket.onclose = (event) => {
      let detail = 'unknown reason';
      if (event.reason != null && event.reason.length > 0) {
        detail = event.reason;
      } else if (event.code != null) {
        detail = `code ${event.code}`;
      }
      this.handleSocketClose(
        socket,
        generation,
        this.failureReason ?? `Live connection closed (${detail})`
      );
    };
  }

  private handleMessage(
    envelope: ReturnType<typeof parseBinanceWebSocketEnvelope>,
    socket: WebSocketLike,
    generation: number
  ): void {
    if (envelope.kind === 'market') {
      const subscription = this.topics.get(envelope.topic);
      if (subscription == null) {
        return;
      }
      for (const listener of subscription.listeners) {
        listener({
          type: 'message',
          topic: envelope.topic,
          generation,
          message: envelope,
        });
      }
      return;
    }

    if (envelope.kind === 'error') {
      this.failSocket(
        socket,
        generation,
        `Binance WebSocket error: ${envelope.message}`
      );
      return;
    }
    if (envelope.kind !== 'subscribed') {
      return;
    }

    const pending = this.findPendingSubscription(envelope.requestId);
    if (pending == null) {
      return;
    }
    clearTimeout(pending.value.timer);
    this.pendingSubscriptions.delete(pending.requestId);
    const subscription = this.topics.get(pending.value.topic);
    if (subscription == null) {
      return;
    }
    subscription.readyGeneration = generation;
    for (const listener of subscription.listeners) {
      listener({
        type: 'ready',
        topic: pending.value.topic,
        generation,
      });
    }

    if (
      [...this.topics.values()].every(
        (value) => value.readyGeneration === generation
      )
    ) {
      this.emitState('connected', null);
      this.clearStableTimer();
      this.stableTimer = setTimeout(() => {
        if (this.isCurrent(socket, generation)) {
          this.reconnectAttempt = 0;
        }
      }, STABLE_CONNECTION_MS);
    }
  }

  private findPendingSubscription(
    requestId: string | null
  ): { requestId: string; value: PendingSubscription } | undefined {
    if (requestId != null) {
      const value = this.pendingSubscriptions.get(requestId);
      return value == null ? undefined : { requestId, value };
    }
    if (this.pendingSubscriptions.size !== 1) {
      return undefined;
    }
    const entry = this.pendingSubscriptions.entries().next().value;
    return entry == null ? undefined : { requestId: entry[0], value: entry[1] };
  }

  private sendSubscribe(
    topic: string,
    socket: WebSocketLike,
    generation: number
  ): void {
    const subscription = this.topics.get(topic);
    if (
      subscription == null ||
      subscription.readyGeneration === generation ||
      [...this.pendingSubscriptions.values()].some(
        (pending) => pending.topic === topic
      )
    ) {
      return;
    }
    const requestId = this.nextRequestId('sub');
    socket.send(
      JSON.stringify({ method: 'SUBSCRIBE', params: [topic], id: requestId })
    );
    const timer = setTimeout(() => {
      this.pendingSubscriptions.delete(requestId);
      this.failSocket(
        socket,
        generation,
        `Subscription timed out for ${topic}`
      );
    }, SUBSCRIBE_TIMEOUT_MS);
    this.pendingSubscriptions.set(requestId, { topic, timer });
  }

  private failSocket(
    socket: WebSocketLike,
    generation: number,
    reason: string
  ): void {
    if (!this.isCurrent(socket, generation)) {
      return;
    }
    this.failureReason = reason;
    if (socket.readyState < SOCKET_CLOSING) {
      socket.close();
    }
    if (this.closeFallbackTimer == null) {
      this.closeFallbackTimer = setTimeout(() => {
        this.closeFallbackTimer = null;
        this.handleSocketClose(socket, generation, reason);
      }, 0);
    }
  }

  private handleSocketClose(
    socket: WebSocketLike,
    generation: number,
    reason: string
  ): void {
    if (!this.isCurrent(socket, generation)) {
      return;
    }
    this.socket = null;
    this.clearTransportTimers();
    for (const subscription of this.topics.values()) {
      subscription.readyGeneration = null;
    }
    this.scheduleReconnect(reason);
  }

  private scheduleReconnect(reason: string): void {
    if (this.topics.size === 0) {
      return;
    }
    if (!this.appIsActive || !this.networkIsReachable) {
      this.emitState(this.appIsActive ? 'offline' : 'paused', null);
      return;
    }
    if (this.reconnectTimer != null) {
      return;
    }
    this.emitState('reconnecting', reason);
    const exponentialDelay = Math.min(
      MAX_RECONNECT_DELAY_MS,
      1_000 * 2 ** Math.min(this.reconnectAttempt, 10)
    );
    const delay = Math.round(
      exponentialDelay / 2 + this.random() * (exponentialDelay / 2)
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnection();
    }, delay);
  }

  private closeCurrentSocket(): void {
    const socket = this.socket;
    this.socket = null;
    this.clearTransportTimers();
    for (const subscription of this.topics.values()) {
      subscription.readyGeneration = null;
    }
    if (socket == null) {
      return;
    }
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (socket.readyState < SOCKET_CLOSING) {
      socket.close();
    }
  }

  private clearPendingSubscriptionForTopic(topic: string): void {
    for (const [requestId, pending] of this.pendingSubscriptions) {
      if (pending.topic === topic) {
        clearTimeout(pending.timer);
        this.pendingSubscriptions.delete(requestId);
      }
    }
  }

  private clearTransportTimers(): void {
    this.clearOpenTimer();
    this.clearStableTimer();
    if (this.closeFallbackTimer != null) {
      clearTimeout(this.closeFallbackTimer);
      this.closeFallbackTimer = null;
    }
    for (const pending of this.pendingSubscriptions.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingSubscriptions.clear();
  }

  private clearOpenTimer(): void {
    if (this.openTimer != null) {
      clearTimeout(this.openTimer);
      this.openTimer = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearStableTimer(): void {
    if (this.stableTimer != null) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
  }

  private emitState(state: BinanceWebSocketState, error: string | null): void {
    if (state === this.state && error === this.stateError) {
      return;
    }
    this.state = state;
    this.stateError = error;
    for (const subscription of this.topics.values()) {
      for (const listener of subscription.listeners) {
        listener({ type: 'state', state, error });
      }
    }
  }

  private nextRequestId(prefix: string): string {
    this.requestSequence += 1;
    return `${prefix}-${this.generation}-${this.requestSequence}`;
  }

  private isCurrent(socket: WebSocketLike, generation: number): boolean {
    return this.socket === socket && this.generation === generation;
  }
}

export const binanceWebSocketClient = new BinanceWebSocketClient();
