import { focusManager, onlineManager } from '@tanstack/react-query';

const OPEN_TIMEOUT_MS = 10_000;
const SUBSCRIBE_TIMEOUT_MS = 10_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const SOCKET_OPEN = 1;
const SOCKET_CLOSING = 2;

export type MarketWebSocketState =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'paused' | 'offline';

export type MarketWebSocketEvent<TMessage> =
  | { type: 'state'; state: MarketWebSocketState; error: string | null }
  | { type: 'ready'; topic: string; generation: number }
  | {
      type: 'message';
      topic: string;
      generation: number;
      message: TMessage;
    };

export type MarketWebSocketEnvelope<TMessage> =
  | { kind: 'market'; topic: string; message: TMessage }
  | { kind: 'subscribed'; acknowledgement: string | null }
  | { kind: 'error'; message: string }
  | { kind: 'control' };

export type MarketWebSocketProtocol<TMessage> = {
  label: string;
  url: string;
  parse(rawMessage: string): MarketWebSocketEnvelope<TMessage>;
  subscribe(
    topic: string,
    requestId: string
  ): { data: string; acknowledgement: string };
  unsubscribe(topic: string, requestId: string): string;
};

type WebSocketLike = {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  send(data: string): void;
  close(): void;
};

class NativeWebSocketAdapter implements WebSocketLike {
  private readonly socket: WebSocket;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.onopen = () => this.onopen?.();
    this.socket.onmessage = (event) =>
      this.onmessage?.({ data: String(event.data) });
    this.socket.onerror = () => this.onerror?.();
    this.socket.onclose = (event) =>
      this.onclose?.({ code: event.code, reason: event.reason });
  }

  get readyState(): number {
    return this.socket.readyState;
  }

  send(data: string): void {
    this.socket.send(data);
  }

  close(): void {
    this.socket.close();
  }
}

type LifecycleOptions = {
  isFocused?: () => boolean;
  isOnline?: () => boolean;
  subscribeFocused?: (listener: () => void) => () => void;
  subscribeOnline?: (listener: () => void) => () => void;
};

export type MarketWebSocketClientOptions = LifecycleOptions & {
  createSocket?: (url: string) => WebSocketLike;
  random?: () => number;
};

type TopicSubscription<TMessage> = {
  listeners: Set<(event: MarketWebSocketEvent<TMessage>) => void>;
  readyGeneration: number | null;
  pendingAcknowledgement: string | null;
};

type PendingSubscription = {
  topic: string;
  timer: ReturnType<typeof setTimeout>;
};

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export class MarketWebSocketClient<TMessage> {
  private readonly protocol: MarketWebSocketProtocol<TMessage>;
  private readonly createSocket: (url: string) => WebSocketLike;
  private readonly random: () => number;
  private readonly isFocused: () => boolean;
  private readonly isOnline: () => boolean;
  private readonly subscribeFocused: (listener: () => void) => () => void;
  private readonly subscribeOnline: (listener: () => void) => () => void;
  private readonly topics = new Map<string, TopicSubscription<TMessage>>();
  private readonly pending = new Map<string, PendingSubscription>();
  private socket: WebSocketLike | null = null;
  private state: MarketWebSocketState = 'idle';
  private stateError: string | null = null;
  private generation = 0;
  private requestSequence = 0;
  private reconnectAttempt = 0;
  private removeFocusListener: (() => void) | null = null;
  private removeOnlineListener: (() => void) | null = null;
  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closeFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private failureReason: string | null = null;

  constructor(
    protocol: MarketWebSocketProtocol<TMessage>,
    options: MarketWebSocketClientOptions = {}
  ) {
    this.protocol = protocol;
    this.createSocket =
      options.createSocket ?? ((url) => new NativeWebSocketAdapter(url));
    this.random = options.random ?? Math.random;
    this.isFocused = options.isFocused ?? (() => focusManager.isFocused());
    this.isOnline = options.isOnline ?? (() => onlineManager.isOnline());
    this.subscribeFocused =
      options.subscribeFocused ??
      ((listener) => focusManager.subscribe(listener));
    this.subscribeOnline =
      options.subscribeOnline ??
      ((listener) => onlineManager.subscribe(listener));
  }

  subscribe(
    topic: string,
    listener: (event: MarketWebSocketEvent<TMessage>) => void
  ): () => void {
    let subscription = this.topics.get(topic);
    const firstTopic = this.topics.size === 0;
    if (subscription == null) {
      subscription = {
        listeners: new Set(),
        readyGeneration: null,
        pendingAcknowledgement: null,
      };
      this.topics.set(topic, subscription);
    }
    subscription.listeners.add(listener);

    if (firstTopic) {
      this.startLifecycleMonitoring();
    } else {
      listener({ type: 'state', state: this.state, error: this.stateError });
      if (subscription.readyGeneration === this.generation) {
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
      if (!subscribed) {
        return;
      }
      subscribed = false;
      this.unsubscribe(topic, listener);
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
      `Invalid ${this.protocol.label} stream data: ${errorMessage(cause)}`
    );
  }

  private unsubscribe(
    topic: string,
    listener: (event: MarketWebSocketEvent<TMessage>) => void
  ): void {
    const subscription = this.topics.get(topic);
    if (subscription == null) {
      return;
    }
    subscription.listeners.delete(listener);
    if (subscription.listeners.size > 0) {
      return;
    }

    this.clearPending(subscription.pendingAcknowledgement);
    this.topics.delete(topic);
    if (this.socket?.readyState === SOCKET_OPEN) {
      this.socket.send(
        this.protocol.unsubscribe(topic, this.nextRequestId('unsub'))
      );
    }
    if (this.topics.size === 0) {
      this.clearReconnectTimer();
      this.closeCurrentSocket();
      this.stopLifecycleMonitoring();
      this.state = 'idle';
      this.stateError = null;
    }
  }

  private startLifecycleMonitoring(): void {
    this.removeFocusListener = this.subscribeFocused(() =>
      this.handleEligibilityChange()
    );
    this.removeOnlineListener = this.subscribeOnline(() =>
      this.handleEligibilityChange()
    );
    this.handleEligibilityChange();
  }

  private stopLifecycleMonitoring(): void {
    this.removeFocusListener?.();
    this.removeFocusListener = null;
    this.removeOnlineListener?.();
    this.removeOnlineListener = null;
  }

  private handleEligibilityChange(): void {
    if (this.topics.size === 0) {
      return;
    }
    if (!this.isFocused() || !this.isOnline()) {
      this.clearReconnectTimer();
      this.closeCurrentSocket();
      this.emitState(this.isFocused() ? 'offline' : 'paused', null);
      return;
    }
    this.ensureConnection();
  }

  private canConnect(): boolean {
    if (this.topics.size === 0 || this.socket != null) {
      return false;
    }
    if (!this.isFocused() || !this.isOnline()) {
      return false;
    }
    return this.reconnectTimer == null;
  }

  private ensureConnection(): void {
    if (!this.canConnect()) {
      return;
    }

    this.emitState(this.generation === 0 ? 'connecting' : 'reconnecting', null);
    const generation = this.generation + 1;
    this.generation = generation;
    this.failureReason = null;
    let socket: WebSocketLike;
    try {
      socket = this.createSocket(this.protocol.url);
    } catch (cause) {
      this.scheduleReconnect(errorMessage(cause));
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
      this.topics.forEach((_subscription, topic) =>
        this.sendSubscribe(topic, socket, generation)
      );
    };
    socket.onmessage = (event) => {
      if (!this.isCurrent(socket, generation)) {
        return;
      }
      try {
        this.handleMessage(this.protocol.parse(event.data), socket, generation);
      } catch (cause) {
        this.failSocket(
          socket,
          generation,
          `Invalid WebSocket message: ${errorMessage(cause)}`
        );
      }
    };
    socket.onerror = () => {
      this.failSocket(socket, generation, 'WebSocket connection error');
    };
    socket.onclose = (event) => {
      const detail =
        event.reason != null && event.reason.length > 0
          ? event.reason
          : `code ${event.code ?? 'unknown'}`;
      this.handleSocketClose(
        socket,
        generation,
        this.failureReason ?? `Live connection closed (${detail})`
      );
    };
  }

  private handleMessage(
    envelope: MarketWebSocketEnvelope<TMessage>,
    socket: WebSocketLike,
    generation: number
  ): void {
    if (envelope.kind === 'market') {
      this.topics.get(envelope.topic)?.listeners.forEach((listener) =>
        listener({
          type: 'message',
          topic: envelope.topic,
          generation,
          message: envelope.message,
        })
      );
      return;
    }
    if (envelope.kind === 'error') {
      this.failSocket(
        socket,
        generation,
        `${this.protocol.label} WebSocket error: ${envelope.message}`
      );
      return;
    }
    if (envelope.kind !== 'subscribed') {
      return;
    }

    const pending = this.findPending(envelope.acknowledgement);
    if (pending == null) {
      return;
    }
    clearTimeout(pending.value.timer);
    this.pending.delete(pending.acknowledgement);
    const subscription = this.topics.get(pending.value.topic);
    if (subscription == null) {
      return;
    }
    subscription.pendingAcknowledgement = null;
    subscription.readyGeneration = generation;
    subscription.listeners.forEach((listener) =>
      listener({
        type: 'ready',
        topic: pending.value.topic,
        generation,
      })
    );

    if (
      [...this.topics.values()].every(
        (value) => value.readyGeneration === generation
      )
    ) {
      this.reconnectAttempt = 0;
      this.emitState('connected', null);
    }
  }

  private findPending(
    acknowledgement: string | null
  ): { acknowledgement: string; value: PendingSubscription } | null {
    if (acknowledgement != null) {
      const value = this.pending.get(acknowledgement);
      return value == null ? null : { acknowledgement, value };
    }
    if (this.pending.size !== 1) {
      return null;
    }
    const entry = this.pending.entries().next().value;
    return entry == null
      ? null
      : { acknowledgement: entry[0], value: entry[1] };
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
      subscription.pendingAcknowledgement != null
    ) {
      return;
    }
    const request = this.protocol.subscribe(topic, this.nextRequestId('sub'));
    socket.send(request.data);
    const timer = setTimeout(() => {
      this.pending.delete(request.acknowledgement);
      subscription.pendingAcknowledgement = null;
      this.failSocket(
        socket,
        generation,
        `Subscription timed out for ${topic}`
      );
    }, SUBSCRIBE_TIMEOUT_MS);
    subscription.pendingAcknowledgement = request.acknowledgement;
    this.pending.set(request.acknowledgement, { topic, timer });
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
    this.topics.forEach((subscription) => {
      subscription.readyGeneration = null;
      subscription.pendingAcknowledgement = null;
    });
    this.scheduleReconnect(reason);
  }

  private scheduleReconnect(reason: string): void {
    if (this.topics.size === 0) {
      return;
    }
    if (!this.isFocused() || !this.isOnline()) {
      this.emitState(this.isFocused() ? 'offline' : 'paused', null);
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
    this.topics.forEach((subscription) => {
      subscription.readyGeneration = null;
      subscription.pendingAcknowledgement = null;
    });
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

  private clearPending(acknowledgement: string | null): void {
    if (acknowledgement == null) {
      return;
    }
    const pending = this.pending.get(acknowledgement);
    if (pending != null) {
      clearTimeout(pending.timer);
      this.pending.delete(acknowledgement);
    }
  }

  private clearTransportTimers(): void {
    this.clearOpenTimer();
    if (this.closeFallbackTimer != null) {
      clearTimeout(this.closeFallbackTimer);
      this.closeFallbackTimer = null;
    }
    this.pending.forEach((value) => clearTimeout(value.timer));
    this.pending.clear();
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

  private emitState(state: MarketWebSocketState, error: string | null): void {
    if (state === this.state && error === this.stateError) {
      return;
    }
    this.state = state;
    this.stateError = error;
    const listeners = new Set<
      (event: MarketWebSocketEvent<TMessage>) => void
    >();
    this.topics.forEach((topic) =>
      topic.listeners.forEach((listener) => listeners.add(listener))
    );
    listeners.forEach((listener) => listener({ type: 'state', state, error }));
  }

  private nextRequestId(prefix: string): string {
    this.requestSequence += 1;
    return `${prefix}-${this.generation}-${this.requestSequence}`;
  }

  private isCurrent(socket: WebSocketLike, generation: number): boolean {
    return this.socket === socket && this.generation === generation;
  }
}
