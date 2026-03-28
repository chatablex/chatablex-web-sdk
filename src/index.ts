/**
 * chatablex-web-sdk
 *
 * Runtime SDK for ChatableX AI App (WebUI) development.
 * Developers install this package and call `ChatableX.init()` to connect
 * their web app to the ChatableX Flutter host.
 *
 * @example
 * ```ts
 * import { ChatableX } from 'chatablex-web-sdk';
 *
 * const sdk = await ChatableX.init({ appId: 'counter-app' });
 *
 * sdk.tool.onExecute(async (params) => {
 *   // handle LLM-driven tool calls
 *   return { success: true, data: 'done' };
 * });
 * ```
 */

import { Bridge } from './bridge';
import { createToolModule } from './modules/tool';
import { createEventsModule } from './modules/events';
import { createAIModule } from './modules/ai';
import { createUIModule } from './modules/ui';
import { createStorageModule } from './modules/storage';
import { createToolsModule } from './modules/tools';
import { createSkillsModule } from './modules/skills';
import type { ChatableXSDK, ChatableXInitConfig, ToolInfo } from './types';

export const SDK_VERSION = '1.0.0';

let _instance: ChatableXSDK | null = null;

/**
 * Main entry point. Provides `ChatableX.init()` to bootstrap the SDK.
 */
export const ChatableX = {
  /**
   * Initialize the SDK and establish the bridge with the Flutter host.
   *
   * 1. Sets up `window.ChatableXReceive` (Flutter → JS message handler).
   * 2. Waits for `window.ChatableXBridge` (Flutter's JavaScriptChannel).
   * 3. Sends `sdk_init` handshake and receives tool config from Flutter.
   * 4. Returns the fully-initialised SDK instance.
   */
  async init(config: ChatableXInitConfig): Promise<ChatableXSDK> {
    if (_instance) return _instance;

    const debug = config.debug ?? false;
    const timeout = config.timeout ?? 10_000;
    const bridge = new Bridge(debug);

    // 1. Install the global receiver first
    bridge.install();

    // 2. Wait for Flutter to set up the channel
    await bridge.waitForBridge(timeout);

    if (debug) console.log('[ChatableX] Bridge connected, sending sdk_init');

    // 3. Handshake — tell Flutter we're ready and get tool config back
    let toolConfig: Partial<ToolInfo> = {};
    try {
      const resp = await bridge.sendMessage('sdk_init', {
        appId: config.appId,
        sdkVersion: SDK_VERSION,
      });
      if (resp && typeof resp === 'object') {
        toolConfig = resp as Partial<ToolInfo>;
      }
    } catch {
      if (debug) console.warn('[ChatableX] sdk_init handshake failed, continuing with defaults');
    }

    // 4. Create modules
    const toolModule = createToolModule(bridge, config.appId);
    if (toolConfig) toolModule._setInfo(toolConfig);

    const sdk: ChatableXSDK = {
      ai: createAIModule(bridge),
      tools: createToolsModule(bridge),
      skills: createSkillsModule(bridge),
      ui: createUIModule(bridge),
      events: createEventsModule(bridge),
      storage: createStorageModule(bridge),
      tool: toolModule,
    };

    // Expose on window for debugging / Flutter interop
    window.ChatableX = sdk;

    _instance = sdk;
    if (debug) console.log(`[ChatableX] SDK v${SDK_VERSION} ready for: ${config.appId}`);
    return sdk;
  },

  /** Get the current SDK instance (throws if not initialised). */
  getInstance(): ChatableXSDK {
    if (!_instance) throw new Error('ChatableX SDK not initialised. Call ChatableX.init() first.');
    return _instance;
  },

  /** Check whether the SDK has been initialised. */
  isReady(): boolean {
    return _instance !== null;
  },

  /** SDK version */
  version: SDK_VERSION,
};

// Re-export all types
export * from './types';
export { Bridge } from './bridge';
