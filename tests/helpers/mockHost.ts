/**
 * Simulates the Flutter WebView host environment for SDK tests.
 *
 * Mirrors the protocol in chatablex-desktop-app/lib/services/tool_webui_bridge.dart:
 *   JS → Flutter : ChatableXBridge.postMessage(JSON)
 *   Flutter → JS : ChatableXReceive(JSON)
 */

export type SentMessage = {
  id?: string;
  method: string;
  params?: Record<string, unknown>;
  timestamp?: number;
};

export type HostResponse = {
  success: boolean;
  data?: unknown;
  error?: string;
};

export type MockHostOptions = {
  /** Auto-reply to RPC requests using this map (keyed by method name). */
  responses?: Record<string, HostResponse>;
};

export function createMockHost(options: MockHostOptions = {}) {
  const sent: SentMessage[] = [];
  const messageListeners: Array<(msg: SentMessage) => void> = [];

  window.ChatableXBridge = {
    postMessage(jsonStr: string) {
      const msg = JSON.parse(jsonStr) as SentMessage;
      sent.push(msg);

      for (const listener of messageListeners) {
        listener(msg);
      }

      // tool.executeResult is fire-and-forget — no RPC response.
      if (msg.method === 'tool.executeResult') return;

      const preset = options.responses?.[msg.method];
      if (preset && msg.id) {
        queueMicrotask(() => {
          if (!window.ChatableXReceive) return;
          receive({
            type: 'response',
            id: msg.id!,
            success: preset.success,
            data: preset.data,
            error: preset.error,
          });
        });
      }
    },
  };

  function receive(payload: Record<string, unknown>): void {
    if (!window.ChatableXReceive) {
      throw new Error('ChatableXReceive not installed — call bridge.install() or ChatableX.init() first');
    }
    window.ChatableXReceive(JSON.stringify(payload));
  }

  function pushEvent(eventType: string, data: unknown): void {
    receive({ type: 'event', eventType, data });
  }

  function respond(id: string, success: boolean, data?: unknown, error?: string): void {
    receive({ type: 'response', id, success, data, error });
  }

  function onMessage(listener: (msg: SentMessage) => void): () => void {
    messageListeners.push(listener);
    return () => {
      const idx = messageListeners.indexOf(listener);
      if (idx >= 0) messageListeners.splice(idx, 1);
    };
  }

  function findByMethod(method: string): SentMessage | undefined {
    return sent.find((m) => m.method === method);
  }

  function findAllByMethod(method: string): SentMessage[] {
    return sent.filter((m) => m.method === method);
  }

  function clear(): void {
    sent.length = 0;
  }

  return {
    sent,
    receive,
    pushEvent,
    respond,
    onMessage,
    findByMethod,
    findAllByMethod,
    clear,
  };
}

/** Default sdk_init response used by most init tests. */
export const DEFAULT_SDK_INIT_RESPONSE: HostResponse = {
  success: true,
  data: {
    id: 'test-app',
    name: 'Test App',
    version: '2.0.0',
    description: 'A test webapp',
  },
};
