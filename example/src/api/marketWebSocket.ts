import { focusManager, onlineManager } from '@tanstack/react-query';

const OPEN_TIMEOUT_MS = 10_000;
const SUBSCRIBE_TIMEOUT_MS = 10_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const SOCKET_OPEN = 1;
const SOCKET_CLOSING = 2;

export type MarketWebSocketState =
  'connecting' | 'connected' | 'reconnecting' | 'paused' | 'offline';

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
  | { kind: 'ready'; topic: string | null }
  | { kind: 'error'; message: string }
  | { kind: 'control' };

export type MarketWebSocketProtocol<TMessage> = {
  label: string;
  url(topic: string): string;
  parse(rawMessage: string): MarketWebSocketEnvelope<TMessage>;
  subscribe?(topic: string): string;
  heartbeat?: { intervalMs: number; message: string };
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

export type MarketWebSocketFactoryOptions = LifecycleOptions & {
  createSocket?: (url: string) => WebSocketLike;
  random?: () => number;
};

export type MarketWebSocketConnection = {
  retry(): void;
  reportProtocolError(generation: number, cause: unknown): void;
  close(): void;
};

export type MarketWebSocketFactory<TMessage> = {
  connect(
    topic: string,
    listener: (event: MarketWebSocketEvent<TMessage>) => void
  ): MarketWebSocketConnection;
};

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function createMarketWebSocketFactory<TMessage>(
  protocol: MarketWebSocketProtocol<TMessage>,
  options: MarketWebSocketFactoryOptions = {}
): MarketWebSocketFactory<TMessage> {
  const createSocket =
    options.createSocket ?? ((url: string) => new NativeWebSocketAdapter(url));
  const random = options.random ?? Math.random;
  const isFocused = options.isFocused ?? (() => focusManager.isFocused());
  const isOnline = options.isOnline ?? (() => onlineManager.isOnline());
  const subscribeFocused =
    options.subscribeFocused ??
    ((listener: () => void) => focusManager.subscribe(listener));
  const subscribeOnline =
    options.subscribeOnline ??
    ((listener: () => void) => onlineManager.subscribe(listener));

  return {
    connect(topic, listener) {
      let active = true;
      let socket: WebSocketLike | null = null;
      let generation = 0;
      let readyGeneration = 0;
      let reconnectAttempt = 0;
      let state: MarketWebSocketState | null = null;
      let stateError: string | null = null;
      let failureReason: string | null = null;
      let openTimer: ReturnType<typeof setTimeout> | null = null;
      let subscribeTimer: ReturnType<typeof setTimeout> | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let closeFallbackTimer: ReturnType<typeof setTimeout> | null = null;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      function emitState(
        nextState: MarketWebSocketState,
        error: string | null
      ) {
        if (state === nextState && stateError === error) return;
        state = nextState;
        stateError = error;
        listener({ type: 'state', state: nextState, error });
      }

      function isCurrent(target: WebSocketLike, targetGeneration: number) {
        return active && socket === target && generation === targetGeneration;
      }

      function clearTransportTimers() {
        if (openTimer != null) clearTimeout(openTimer);
        if (subscribeTimer != null) clearTimeout(subscribeTimer);
        if (closeFallbackTimer != null) clearTimeout(closeFallbackTimer);
        if (heartbeatTimer != null) clearInterval(heartbeatTimer);
        openTimer = null;
        subscribeTimer = null;
        closeFallbackTimer = null;
        heartbeatTimer = null;
      }

      function clearReconnectTimer() {
        if (reconnectTimer != null) clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      function closeSocket() {
        const current = socket;
        socket = null;
        clearTransportTimers();
        if (current == null) return;
        current.onopen = null;
        current.onmessage = null;
        current.onerror = null;
        current.onclose = null;
        if (current.readyState < SOCKET_CLOSING) current.close();
      }

      function eligible() {
        return active && isFocused() && isOnline();
      }

      function scheduleReconnect(reason: string) {
        if (!active) return;
        if (!isFocused() || !isOnline()) {
          emitState(isFocused() ? 'offline' : 'paused', null);
          return;
        }
        if (reconnectTimer != null) return;
        emitState('reconnecting', reason);
        const exponentialDelay = Math.min(
          MAX_RECONNECT_DELAY_MS,
          1_000 * 2 ** Math.min(reconnectAttempt, 10)
        );
        const delay = Math.round(
          exponentialDelay / 2 + random() * (exponentialDelay / 2)
        );
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          openSocket();
        }, delay);
      }

      function handleClose(
        target: WebSocketLike,
        targetGeneration: number,
        reason: string
      ) {
        if (!isCurrent(target, targetGeneration)) return;
        socket = null;
        clearTransportTimers();
        scheduleReconnect(reason);
      }

      function failSocket(
        target: WebSocketLike,
        targetGeneration: number,
        reason: string
      ) {
        if (!isCurrent(target, targetGeneration)) return;
        failureReason = reason;
        if (target.readyState < SOCKET_CLOSING) target.close();
        if (closeFallbackTimer == null) {
          closeFallbackTimer = setTimeout(() => {
            closeFallbackTimer = null;
            handleClose(target, targetGeneration, reason);
          }, 0);
        }
      }

      function markReady(target: WebSocketLike, targetGeneration: number) {
        if (!isCurrent(target, targetGeneration)) return;
        if (readyGeneration === targetGeneration) return;
        readyGeneration = targetGeneration;
        if (subscribeTimer != null) clearTimeout(subscribeTimer);
        subscribeTimer = null;
        reconnectAttempt = 0;
        listener({ type: 'ready', topic, generation: targetGeneration });
        emitState('connected', null);
      }

      function handleEnvelope(
        envelope: MarketWebSocketEnvelope<TMessage>,
        target: WebSocketLike,
        targetGeneration: number
      ) {
        if (envelope.kind === 'market') {
          if (envelope.topic === topic) {
            listener({
              type: 'message',
              topic,
              generation: targetGeneration,
              message: envelope.message,
            });
          }
          return;
        }
        if (envelope.kind === 'ready') {
          if (envelope.topic == null || envelope.topic === topic) {
            markReady(target, targetGeneration);
          }
          return;
        }
        if (envelope.kind === 'error') {
          failSocket(
            target,
            targetGeneration,
            `${protocol.label} WebSocket error: ${envelope.message}`
          );
        }
      }

      function startHeartbeat(target: WebSocketLike, targetGeneration: number) {
        const heartbeat = protocol.heartbeat;
        if (heartbeat == null) return;
        heartbeatTimer = setInterval(() => {
          if (
            isCurrent(target, targetGeneration) &&
            target.readyState === SOCKET_OPEN
          ) {
            target.send(heartbeat.message);
          }
        }, heartbeat.intervalMs);
      }

      function startSubscription(
        target: WebSocketLike,
        targetGeneration: number
      ) {
        const subscribe = protocol.subscribe;
        if (subscribe == null) {
          markReady(target, targetGeneration);
          return;
        }
        try {
          target.send(subscribe(topic));
        } catch (cause) {
          failSocket(target, targetGeneration, errorMessage(cause));
          return;
        }
        subscribeTimer = setTimeout(() => {
          failSocket(
            target,
            targetGeneration,
            `Subscription timed out for ${topic}`
          );
        }, SUBSCRIBE_TIMEOUT_MS);
      }

      function openSocket() {
        if (!eligible() || socket != null || reconnectTimer != null) return;
        emitState(generation === 0 ? 'connecting' : 'reconnecting', null);
        const targetGeneration = generation + 1;
        generation = targetGeneration;
        failureReason = null;
        let target: WebSocketLike;
        try {
          target = createSocket(protocol.url(topic));
        } catch (cause) {
          scheduleReconnect(errorMessage(cause));
          return;
        }
        socket = target;
        openTimer = setTimeout(() => {
          failSocket(
            target,
            targetGeneration,
            'WebSocket connection timed out'
          );
        }, OPEN_TIMEOUT_MS);

        target.onopen = () => {
          if (!isCurrent(target, targetGeneration)) return;
          if (openTimer != null) clearTimeout(openTimer);
          openTimer = null;
          startHeartbeat(target, targetGeneration);
          startSubscription(target, targetGeneration);
        };
        target.onmessage = (event) => {
          if (!isCurrent(target, targetGeneration)) return;
          try {
            handleEnvelope(
              protocol.parse(event.data),
              target,
              targetGeneration
            );
          } catch (cause) {
            failSocket(
              target,
              targetGeneration,
              `Invalid WebSocket message: ${errorMessage(cause)}`
            );
          }
        };
        target.onerror = () => {
          failSocket(target, targetGeneration, 'WebSocket connection error');
        };
        target.onclose = (event) => {
          const detail =
            event.reason != null && event.reason.length > 0
              ? event.reason
              : `code ${event.code ?? 'unknown'}`;
          handleClose(
            target,
            targetGeneration,
            failureReason ?? `Live connection closed (${detail})`
          );
        };
      }

      function handleEligibilityChange() {
        if (!active) return;
        if (!isFocused() || !isOnline()) {
          clearReconnectTimer();
          closeSocket();
          emitState(isFocused() ? 'offline' : 'paused', null);
          return;
        }
        openSocket();
      }

      const removeFocusListener = subscribeFocused(handleEligibilityChange);
      const removeOnlineListener = subscribeOnline(handleEligibilityChange);
      handleEligibilityChange();

      return {
        retry() {
          reconnectAttempt = 0;
          clearReconnectTimer();
          closeSocket();
          openSocket();
        },
        reportProtocolError(targetGeneration, cause) {
          if (targetGeneration !== generation || socket == null) return;
          failSocket(
            socket,
            targetGeneration,
            `Invalid ${protocol.label} stream data: ${errorMessage(cause)}`
          );
        },
        close() {
          if (!active) return;
          active = false;
          clearReconnectTimer();
          closeSocket();
          removeFocusListener();
          removeOnlineListener();
        },
      };
    },
  };
}
