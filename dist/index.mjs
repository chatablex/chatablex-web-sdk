// src/bridge.ts
var Bridge = class {
  constructor(debug = false) {
    this._msgId = 0;
    this._pending = /* @__PURE__ */ new Map();
    this._listeners = /* @__PURE__ */ new Map();
    this._debug = debug;
  }
  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  /** Install the global ChatableXReceive handler so Flutter can push data in. */
  install() {
    window.ChatableXReceive = (jsonStr) => {
      try {
        const data = JSON.parse(jsonStr);
        if (data.type === "response") {
          this._handleResponse(data);
        } else if (data.type === "event") {
          this._handleEvent(data);
        }
      } catch (e) {
        console.error("[ChatableX Bridge] receive parse error:", e);
      }
    };
    this._log("ChatableXReceive installed");
  }
  /** Wait for ChatableXBridge (set by Flutter) to become available. */
  waitForBridge(timeoutMs) {
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
  sendMessage(method, params = {}, requestTimeoutMs = 3e4) {
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
        reject(new Error("ChatableXBridge not available"));
      }
    });
  }
  _handleResponse(data) {
    const pending = this._pending.get(data.id);
    if (!pending) return;
    this._pending.delete(data.id);
    clearTimeout(pending.timer);
    if (data.success) {
      pending.resolve(data.data);
    } else {
      pending.reject(new Error(data.error ?? "Unknown error"));
    }
  }
  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------
  _handleEvent(data) {
    const handlers = this._listeners.get(data.eventType);
    if (handlers) {
      for (const fn of handlers) {
        try {
          fn(data.data);
        } catch (e) {
          console.error("[ChatableX] event handler error:", e);
        }
      }
    }
  }
  addEventListener(eventType, handler) {
    if (!this._listeners.has(eventType)) {
      this._listeners.set(eventType, /* @__PURE__ */ new Set());
    }
    this._listeners.get(eventType).add(handler);
    return () => {
      const set = this._listeners.get(eventType);
      if (set) {
        set.delete(handler);
        if (set.size === 0) this._listeners.delete(eventType);
      }
    };
  }
  /** Dispatch a synthetic event (used internally). */
  dispatchEvent(eventType, data) {
    this._handleEvent({ eventType, data });
  }
  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------
  _nextId() {
    return `ctx_${++this._msgId}_${Date.now()}`;
  }
  _log(...args) {
    if (this._debug) console.log("[ChatableX Bridge]", ...args);
  }
  destroy() {
    for (const [, p] of this._pending) {
      clearTimeout(p.timer);
      p.reject(new Error("Bridge destroyed"));
    }
    this._pending.clear();
    this._listeners.clear();
    window.ChatableXReceive = void 0;
  }
};

// src/modules/tool.ts
function createToolModule(bridge, appId) {
  let _info = { id: appId, name: appId, version: "1.0.0", description: "" };
  let _handler = null;
  const dispatch = async (params) => {
    if (!_handler) {
      return { success: false, error: "No execute handler registered" };
    }
    try {
      return await _handler(params);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: msg };
    }
  };
  window.__CHATABLEX_DISPATCH__ = dispatch;
  bridge.addEventListener("toolExecution", async (data) => {
    const params = data;
    const requestId = params._requestId;
    const result = await dispatch(params);
    if (requestId && window.ChatableXBridge) {
      window.ChatableXBridge.postMessage(JSON.stringify({
        method: "tool.executeResult",
        params: { _requestId: requestId, ...result }
      }));
    }
  });
  return {
    getInfo() {
      return { ..._info };
    },
    onExecute(handler) {
      _handler = handler;
    },
    /** @internal — called by SDK after handshake to fill in tool metadata */
    _setInfo(info) {
      _info = { ..._info, ...info };
    }
  };
}

// src/modules/events.ts
function createEventsModule(bridge) {
  return {
    on(eventType, callback) {
      bridge.sendMessage("events.subscribe", { eventType }).catch(() => {
      });
      return bridge.addEventListener(eventType, callback);
    },
    onAiResponse(callback) {
      return this.on("aiResponse", callback);
    },
    onToolExecution(callback) {
      return this.on("toolExecution", callback);
    },
    onUserMessage(callback) {
      return this.on("userMessage", callback);
    }
  };
}

// src/modules/ai.ts
function createAIModule(bridge) {
  return {
    chat(message, options) {
      return bridge.sendMessage("ai.chat", { message, ...options });
    },
    chatStream(message, options) {
      return bridge.sendMessage("ai.chatStream", { message, ...options });
    },
    getContext() {
      return bridge.sendMessage("ai.getContext", {});
    }
  };
}

// src/modules/ui.ts
function createUIModule(bridge) {
  return {
    showNotification(message, type = "info") {
      return bridge.sendMessage("ui.showNotification", { message, type });
    },
    showConfirm(title, message) {
      return bridge.sendMessage("ui.showConfirm", { title, message });
    },
    pickFile(options) {
      return bridge.sendMessage("ui.pickFile", options ?? {});
    },
    openTab(config) {
      return bridge.sendMessage("ui.openTab", config);
    },
    updateState(state) {
      return bridge.sendMessage("ui.updateState", state);
    }
  };
}

// src/modules/storage.ts
function createStorageModule(bridge) {
  return {
    get(key) {
      return bridge.sendMessage("storage.get", { key });
    },
    set(key, value) {
      return bridge.sendMessage("storage.set", { key, value });
    },
    delete(key) {
      return bridge.sendMessage("storage.delete", { key });
    }
  };
}

// src/modules/tools.ts
function createToolsModule(bridge) {
  return {
    list() {
      return bridge.sendMessage("tools.list", {});
    },
    execute(toolId, params) {
      return bridge.sendMessage("tools.execute", { toolId, params });
    },
    executeWithConfirm(toolId, params) {
      return bridge.sendMessage("tools.executeWithConfirm", { toolId, params });
    }
  };
}

// src/modules/skills.ts
function createSkillsModule(bridge) {
  return {
    list() {
      return bridge.sendMessage("skills.list", {});
    },
    execute(skillId, variables) {
      return bridge.sendMessage("skills.execute", { skillId, variables });
    }
  };
}

// src/index.ts
var SDK_VERSION = "1.0.0";
var _instance = null;
var ChatableX = {
  /**
   * Initialize the SDK and establish the bridge with the Flutter host.
   *
   * 1. Sets up `window.ChatableXReceive` (Flutter → JS message handler).
   * 2. Waits for `window.ChatableXBridge` (Flutter's JavaScriptChannel).
   * 3. Sends `sdk_init` handshake and receives tool config from Flutter.
   * 4. Returns the fully-initialised SDK instance.
   */
  async init(config) {
    if (_instance) return _instance;
    const debug = config.debug ?? false;
    const timeout = config.timeout ?? 1e4;
    const bridge = new Bridge(debug);
    bridge.install();
    await bridge.waitForBridge(timeout);
    if (debug) console.log("[ChatableX] Bridge connected, sending sdk_init");
    let toolConfig = {};
    try {
      const resp = await bridge.sendMessage("sdk_init", {
        appId: config.appId,
        sdkVersion: SDK_VERSION
      });
      if (resp && typeof resp === "object") {
        toolConfig = resp;
      }
    } catch {
      if (debug) console.warn("[ChatableX] sdk_init handshake failed, continuing with defaults");
    }
    const toolModule = createToolModule(bridge, config.appId);
    if (toolConfig) toolModule._setInfo(toolConfig);
    const sdk = {
      ai: createAIModule(bridge),
      tools: createToolsModule(bridge),
      skills: createSkillsModule(bridge),
      ui: createUIModule(bridge),
      events: createEventsModule(bridge),
      storage: createStorageModule(bridge),
      tool: toolModule
    };
    window.ChatableX = sdk;
    _instance = sdk;
    if (debug) console.log(`[ChatableX] SDK v${SDK_VERSION} ready for: ${config.appId}`);
    return sdk;
  },
  /** Get the current SDK instance (throws if not initialised). */
  getInstance() {
    if (!_instance) throw new Error("ChatableX SDK not initialised. Call ChatableX.init() first.");
    return _instance;
  },
  /** Check whether the SDK has been initialised. */
  isReady() {
    return _instance !== null;
  },
  /** SDK version */
  version: SDK_VERSION
};
export {
  Bridge,
  ChatableX,
  SDK_VERSION
};
