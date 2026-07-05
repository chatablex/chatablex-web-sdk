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
import { createPlatformModule } from './modules/platform';
import { createAuthModule } from './modules/auth';
import { createCloudModule } from './modules/cloud';
import { createOfficialModule } from './modules/official';
import { createAgentLockModule } from './modules/agentLock';
import {
  createWebAuthModule,
  shouldBootstrapStandaloneWebAuth,
} from './modules/webAuth';
import type { ChatableXSDK, ChatableXInitConfig, ToolInfo } from './types';
import pkg from '../package.json';

export const SDK_VERSION = pkg.version;

let _instance: ChatableXSDK | null = null;

function buildSdk(
  bridge: Bridge,
  config: ChatableXInitConfig,
  authModule: ChatableXSDK['auth'],
  toolConfig: Partial<ToolInfo> = {},
): ChatableXSDK {
  const agentLockModule = createAgentLockModule(bridge, config.agentLock);
  const toolModule = createToolModule(bridge, config.appId, agentLockModule);
  if (toolConfig) toolModule._setInfo(toolConfig);

  return {
    ai: createAIModule(bridge),
    tools: createToolsModule(bridge),
    ui: createUIModule(bridge),
    events: createEventsModule(bridge),
    storage: createStorageModule(bridge),
    tool: toolModule,
    platform: createPlatformModule(bridge),
    auth: authModule,
    cloud: createCloudModule(bridge, {
      appId: config.appId,
      auth: authModule,
      apiBaseUrl: config.apiBaseUrl,
    }),
    official: createOfficialModule(bridge, {
      appId: config.appId,
      auth: authModule,
      apiBaseUrl: config.apiBaseUrl,
    }),
    agentLock: agentLockModule,
  };
}

async function initStandalone(config: ChatableXInitConfig): Promise<ChatableXSDK> {
  const debug = config.debug ?? false;
  if (!config.apiBaseUrl?.trim()) {
    throw new Error('standalone mode requires apiBaseUrl in ChatableX.init()');
  }

  const bridge = new Bridge(debug);
  bridge.install();

  const authModule = createWebAuthModule({
    appId: config.appId,
    apiBaseUrl: config.apiBaseUrl,
    storageKey: config.webAuthStorageKey,
  });
  await authModule.handleAuthCallback();

  const sdk = buildSdk(bridge, config, authModule, {
    id: config.appId,
    name: config.appId,
    version: '1.0.0',
    description: '',
  });

  window.ChatableX = sdk;
  _instance = sdk;
  if (debug) console.log(`[ChatableX] SDK v${SDK_VERSION} standalone ready for: ${config.appId}`);
  return sdk;
}

async function initHosted(config: ChatableXInitConfig): Promise<ChatableXSDK> {
  const debug = config.debug ?? false;
  const timeout = config.timeout ?? 10_000;
  const bridge = new Bridge(debug);

  bridge.install();
  await bridge.waitForBridge(timeout);

  if (debug) console.log('[ChatableX] Bridge connected, sending sdk_init');

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

  const authModule = createAuthModule(bridge);
  const sdk = buildSdk(bridge, config, authModule, toolConfig);

  window.ChatableX = sdk;
  _instance = sdk;
  if (debug) console.log(`[ChatableX] SDK v${SDK_VERSION} ready for: ${config.appId}`);
  return sdk;
}

/**
 * Main entry point. Provides `ChatableX.init()` to bootstrap the SDK.
 */
export const ChatableX = {
  /**
   * Initialize the SDK and establish the bridge with the Flutter host.
   *
   * Hosted (WebView):
   * 1. Sets up `window.ChatableXReceive` (Flutter → JS message handler).
   * 2. Waits for `window.ChatableXBridge` (Flutter's JavaScriptChannel).
   * 3. Sends `sdk_init` handshake and receives tool config from Flutter.
   *
   * Standalone (browser with `?auth_code=` or stored JWT):
   * Skips the bridge and uses `WebAuthProvider` + `sdk.cloud` over auth-fc.
   */
  async init(config: ChatableXInitConfig): Promise<ChatableXSDK> {
    if (_instance) return _instance;

    const standalone =
      config.standalone === true ||
      (config.standalone !== false && shouldBootstrapStandaloneWebAuth(config));

    if (standalone) {
      return initStandalone(config);
    }
    return initHosted(config);
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

  /** @internal Reset singleton — tests only. */
  _resetForTests(): void {
    _instance = null;
    delete window.ChatableX;
  },
};

// Re-export all types
export * from './types';
export { Bridge } from './bridge';
export {
  CloudError,
  CloudAuthRequiredError,
  CloudSubscriptionRequiredError,
  CloudQuotaExceededError,
  CloudNotFoundError,
} from './modules/cloud';
export {
  OfficialError,
  OfficialAuthRequiredError,
  OfficialForbiddenError,
  OfficialConflictError,
  computeOfficialContentHash,
} from './modules/official';
export {
  hasAuthCodeInUrl,
  hasWebAuthSession,
  shouldBootstrapStandaloneWebAuth,
  WebAuthProvider,
  createWebAuthModule,
  resolveWebAuthStorageKey,
} from './modules/webAuth';
