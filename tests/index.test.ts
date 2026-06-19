import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pkg from '../package.json';
import { createMockHost, DEFAULT_SDK_INIT_RESPONSE } from './helpers/mockHost';

describe('ChatableX.init', () => {
  beforeEach(() => {
    vi.resetModules();
    delete window.ChatableX;
    delete window.ChatableXBridge;
    delete window.ChatableXReceive;
    delete window.__CHATABLEX_DISPATCH__;
  });

  afterEach(() => {
    vi.resetModules();
  });

  async function importSdk() {
    return import('../src/index');
  }

  it('waits for bridge, sends sdk_init, and returns SDK with all modules', async () => {
    const host = createMockHost({ responses: { sdk_init: DEFAULT_SDK_INIT_RESPONSE } });
    const { ChatableX, SDK_VERSION } = await importSdk();

    const sdk = await ChatableX.init({ appId: 'test-app' });

    const initMsg = host.findByMethod('sdk_init');
    expect(initMsg).toBeDefined();
    expect(initMsg!.params).toEqual({ appId: 'test-app', sdkVersion: SDK_VERSION });

    expect(sdk.ai).toBeDefined();
    expect(sdk.tools).toBeDefined();
    expect(sdk.ui).toBeDefined();
    expect(sdk.events).toBeDefined();
    expect(sdk.storage).toBeDefined();
    expect(sdk.tool).toBeDefined();
    expect(sdk.platform).toBeDefined();
    expect(sdk.auth).toBeDefined();
    expect(sdk.agentLock).toBeDefined();

    expect(ChatableX.isReady()).toBe(true);
    expect(ChatableX.getInstance()).toBe(sdk);
    expect(window.ChatableX).toBe(sdk);
  });

  it('fills tool metadata from sdk_init response', async () => {
    createMockHost({ responses: { sdk_init: DEFAULT_SDK_INIT_RESPONSE } });
    const { ChatableX } = await importSdk();
    const sdk = await ChatableX.init({ appId: 'test-app' });

    expect(sdk.tool.getInfo()).toEqual({
      id: 'test-app',
      name: 'Test App',
      version: '2.0.0',
      description: 'A test webapp',
    });
  });

  it('continues with defaults when sdk_init fails', async () => {
    const host = createMockHost({
      responses: { sdk_init: { success: false, error: 'handshake failed' } },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { ChatableX } = await importSdk();

    const sdk = await ChatableX.init({ appId: 'fallback-app', debug: true });
    expect(host.findByMethod('sdk_init')).toBeDefined();
    expect(sdk.tool.getInfo()).toEqual({
      id: 'fallback-app',
      name: 'fallback-app',
      version: '1.0.0',
      description: '',
    });
    warnSpy.mockRestore();
  });

  it('returns the same instance on repeated init (singleton)', async () => {
    createMockHost({
      responses: {
        sdk_init: {
          success: true,
          data: { id: 'app-a', name: 'App A', version: '1.0.0', description: '' },
        },
      },
    });
    const { ChatableX } = await importSdk();

    const first = await ChatableX.init({ appId: 'app-a' });
    const second = await ChatableX.init({ appId: 'app-b' });
    expect(second).toBe(first);
    // Second init is ignored — metadata from first handshake is preserved.
    expect(second.tool.getInfo().id).toBe('app-a');
  });

  it('getInstance throws before init', async () => {
    const { ChatableX } = await importSdk();
    expect(() => ChatableX.getInstance()).toThrow('ChatableX SDK not initialised');
    expect(ChatableX.isReady()).toBe(false);
  });

  it('exposes SDK_VERSION via ChatableX.version', async () => {
    const { ChatableX, SDK_VERSION } = await importSdk();
    expect(ChatableX.version).toBe(SDK_VERSION);
    expect(SDK_VERSION).toBe(pkg.version);
  });
});
