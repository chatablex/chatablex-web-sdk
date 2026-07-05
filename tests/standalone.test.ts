import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockHost } from './helpers/mockHost';

const API_BASE = 'https://api.test';
const STORAGE_KEY = 'chatablex_standalone_app';

function jsonRes(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('ChatableX.init standalone', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    delete window.ChatableX;
    delete window.ChatableXBridge;
    delete window.ChatableXReceive;
    delete window.__CHATABLEX_DISPATCH__;
    window.history.replaceState({}, '', '/?auth_code=handoff');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonRes(200, {
          success: true,
          data: {
            token: {
              access_token: 'browser-tok',
              refresh_token: 'browser-ref',
              expires_in: 3600,
              token_type: 'Bearer',
            },
          },
        }),
      ),
    );
  });

  afterEach(async () => {
    const { ChatableX } = await import('../src/index');
    ChatableX._resetForTests();
    vi.unstubAllGlobals();
    vi.resetModules();
    localStorage.clear();
  });

  it('skips bridge and initialises sdk.auth + sdk.cloud in browser handoff', async () => {
    const { ChatableX } = await import('../src/index');
    const sdk = await ChatableX.init({
      appId: 'standalone-app',
      apiBaseUrl: API_BASE,
      standalone: true,
      webAuthStorageKey: STORAGE_KEY,
    });

    expect(window.ChatableXBridge).toBeUndefined();
    expect(sdk.auth.isAuthenticated()).toBe(true);
    expect(await sdk.auth.getAuthHeaders()).toEqual({ Authorization: 'Bearer browser-tok' });
    expect(sdk.cloud).toBeDefined();
    expect(window.location.search).not.toContain('auth_code');
  });

  it('does not wait for bridge when auto-detecting standalone session', async () => {
    localStorage.setItem(`${STORAGE_KEY}_access_token`, 'cached');
    localStorage.setItem(`${STORAGE_KEY}_refresh_token`, 'cached-ref');
    localStorage.setItem(`${STORAGE_KEY}_access_expires_at`, String(Date.now() + 60_000));
    window.history.replaceState({}, '', '/');

    const { ChatableX } = await import('../src/index');
    const sdk = await ChatableX.init({
      appId: 'standalone-app',
      apiBaseUrl: API_BASE,
      webAuthStorageKey: STORAGE_KEY,
    });

    expect(sdk.auth.isAuthenticated()).toBe(true);
  });
});

describe('ChatableX.init hosted', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { ChatableX } = await import('../src/index');
    ChatableX._resetForTests();
    delete window.ChatableX;
    delete window.ChatableXBridge;
    delete window.ChatableXReceive;
    delete window.__CHATABLEX_DISPATCH__;
  });

  afterEach(async () => {
    const { ChatableX } = await import('../src/index');
    ChatableX._resetForTests();
    vi.resetModules();
  });

  it('still uses bridge when present', async () => {
    const host = createMockHost({
      responses: {
        sdk_init: {
          success: true,
          data: { id: 'hosted-app', name: 'Hosted App', version: '1.0.0', description: '' },
        },
      },
    });
    const { ChatableX } = await import('../src/index');
    const sdk = await ChatableX.init({ appId: 'hosted-app' });
    expect(host.findByMethod('sdk_init')).toBeDefined();
    expect(sdk.tool.getInfo().id).toBe('hosted-app');
  });
});
