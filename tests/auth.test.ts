import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockHost, DEFAULT_SDK_INIT_RESPONSE } from './helpers/mockHost';
import type { HostResponse } from './helpers/mockHost';

const FUTURE = () => Date.now() + 60 * 60 * 1000; // 1h ahead
const PAST = () => Date.now() - 1000; // already expired

function authResponse(overrides: Record<string, unknown> = {}): HostResponse {
  return {
    success: true,
    data: { access_token: 'tok-1', expires_at: FUTURE(), user_id: 'u-42', ...overrides },
  };
}

describe('sdk.auth', () => {
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

  async function initSdk(responses: Record<string, HostResponse>) {
    const host = createMockHost({ responses: { sdk_init: DEFAULT_SDK_INIT_RESPONSE, ...responses } });
    const { ChatableX } = await import('../src/index');
    const sdk = await ChatableX.init({ appId: 'auth-test' });
    return { host, sdk };
  }

  it('exposes auth on the SDK with the full interface (FR-01)', async () => {
    const { sdk } = await initSdk({ 'host.getAuthToken': authResponse() });
    expect(sdk.auth).toBeDefined();
    expect(typeof sdk.auth.getToken).toBe('function');
    expect(typeof sdk.auth.getAuthHeaders).toBe('function');
    expect(typeof sdk.auth.getUserId).toBe('function');
    expect(typeof sdk.auth.isAuthenticated).toBe('function');
    expect(typeof sdk.auth.refresh).toBe('function');
  });

  it('fetches a token via host.getAuthToken and caches it (FR-02)', async () => {
    const { host, sdk } = await initSdk({ 'host.getAuthToken': authResponse() });

    const token = await sdk.auth.getToken();
    expect(token).toMatchObject({ access_token: 'tok-1', user_id: 'u-42' });
    expect(host.findAllByMethod('host.getAuthToken')).toHaveLength(1);

    // second call hits cache, no extra bridge round-trip
    await sdk.auth.getToken();
    expect(host.findAllByMethod('host.getAuthToken')).toHaveLength(1);
    expect(sdk.auth.isAuthenticated()).toBe(true);
    expect(sdk.auth.getUserId()).toBe('u-42');
  });

  it('builds a Bearer header when authenticated (FR-03)', async () => {
    const { sdk } = await initSdk({ 'host.getAuthToken': authResponse() });
    const headers = await sdk.auth.getAuthHeaders();
    expect(headers).toEqual({ Authorization: 'Bearer tok-1' });
  });

  it('returns {} and isAuthenticated=false when host says not authenticated (FR-03/07)', async () => {
    const { sdk } = await initSdk({
      'host.getAuthToken': { success: true, data: { error: 'not_authenticated' } },
    });
    const headers = await sdk.auth.getAuthHeaders();
    expect(headers).toEqual({});
    expect(sdk.auth.isAuthenticated()).toBe(false);
    expect(sdk.auth.getUserId()).toBeNull();
    expect(await sdk.auth.getToken()).toBeNull();
  });

  it('refetches when cached token is expired (FR-04)', async () => {
    const { host, sdk } = await initSdk({ 'host.getAuthToken': authResponse({ expires_at: PAST() }) });
    await sdk.auth.getToken();
    expect(sdk.auth.isAuthenticated()).toBe(false);
    // expired cache forces another fetch
    await sdk.auth.getToken();
    expect(host.findAllByMethod('host.getAuthToken').length).toBeGreaterThanOrEqual(2);
  });

  it('merges concurrent refreshes into a single host call (FR-04 single-flight)', async () => {
    const { host, sdk } = await initSdk({ 'host.getAuthToken': authResponse() });
    await Promise.all([sdk.auth.refresh(), sdk.auth.refresh(), sdk.auth.refresh()]);
    expect(host.findAllByMethod('host.getAuthToken')).toHaveLength(1);
  });

  it('degrades safely when the host call fails (FR-07)', async () => {
    const { sdk } = await initSdk({
      'host.getAuthToken': { success: false, error: 'boom' },
    });
    await expect(sdk.auth.getAuthHeaders()).resolves.toEqual({});
    expect(sdk.auth.isAuthenticated()).toBe(false);
  });
});
