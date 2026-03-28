/**
 * Low-level WebView bridge between the Web SDK and the Flutter host.
 *
 * Communication:
 *   JS → Flutter : window.ChatableXBridge.postMessage(JSON.stringify(msg))
 *   Flutter → JS : controller.runJavaScript("window.ChatableXReceive('...')")
 */

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type EventHandler = (data: unknown) => void;

export class Bridge {
  private _msgId = 0;
  private _pending = new Map<string, PendingRequest>();
  private _listeners = new Map<string, Set<EventHandler>>();
  private _debug: boolean;

  constructor(debug = false) {
    this._debug = debug;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Install the global ChatableXReceive handler so Flutter can push data in. */
  install(): void {
    window.ChatableXReceive = (jsonStr: string) => {
      try {
        const data = JSON.parse(jsonStr);
        if (data.type === 'response') {
          this._handleResponse(data);
        } else if (data.type === 'event') {
          this._handleEvent(data);
        }
      } catch (e) {
        console.error('[ChatableX Bridge] receive parse error:', e);
      }
    };
    this._log('ChatableXReceive installed');
  }

  /** Wait for ChatableXBridge (set by Flutter) to become available. */
  waitForBridge(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.ChatableXBridge) {
        resolve();
        return;
      }
      const start = Date.now();
      const check = setInterval(() => {
        if (window.ChatableXBridge) {
          clearInterval(check);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(check);
          reject(new Error(`ChatableXBridge not available after ${timeoutMs}ms`));
        }
      }, 50);
    });
  }

  // -------------------------------------------------------------------------
  // Request / Response
  // -------------------------------------------------------------------------

  /** Send a request to Flutter and wait for a response. */
  sendMessage(method: string, params: Record<string, unknown> = {}, requestTimeoutMs = 30_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this._nextId();
      const message = { id, method, params, timestamp: Date.now() };

      const timer = setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, requestTimeoutMs);

      this._pending.set(id, { resolve, reject, timer });

      if (window.ChatableXBridge) {
        window.ChatableXBridge.postMessage(JSON.stringify(message));
      } else {
        clearTimeout(timer);
        this._pending.delete(id);
        reject(new Error('ChatableXBridge not available'));
      }
    });
  }

  private _handleResponse(data: { id: string; success: boolean; data?: unknown; error?: string }): void {
    const pending = this._pending.get(data.id);
    if (!pending) return;
    this._pending.delete(data.id);
    clearTimeout(pending.timer);
    if (data.success) {
      pending.resolve(data.data);
    } else {
      pending.reject(new Error(data.error ?? 'Unknown error'));
    }
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  private _handleEvent(data: { eventType: string; data: unknown }): void {
    const handlers = this._listeners.get(data.eventType);
    if (handlers) {
      for (const fn of handlers) {
        try { fn(data.data); } catch (e) { console.error('[ChatableX] event handler error:', e); }
      }
    }
  }

  addEventListener(eventType: string, handler: EventHandler): () => void {
    if (!this._listeners.has(eventType)) {
      this._listeners.set(eventType, new Set());
    }
    this._listeners.get(eventType)!.add(handler);
    return () => {
      const set = this._listeners.get(eventType);
      if (set) {
        set.delete(handler);
        if (set.size === 0) this._listeners.delete(eventType);
      }
    };
  }

  /** Dispatch a synthetic event (used internally). */
  dispatchEvent(eventType: string, data: unknown): void {
    this._handleEvent({ eventType, data });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private _nextId(): string {
    return `ctx_${++this._msgId}_${Date.now()}`;
  }

  private _log(...args: unknown[]): void {
    if (this._debug) console.log('[ChatableX Bridge]', ...args);
  }

  destroy(): void {
    for (const [, p] of this._pending) {
      clearTimeout(p.timer);
      p.reject(new Error('Bridge destroyed'));
    }
    this._pending.clear();
    this._listeners.clear();
    window.ChatableXReceive = undefined;
  }
}
