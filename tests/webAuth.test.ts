import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  hasAuthCodeInUrl,
  hasWebAuthSession,
  WebAuthProvider,
  createWebAuthModule,
} from '../src/modules/webAuth';

const API_BASE = 'https://api.test';
const STORAGE_KEY = 'chatablex_test_app';

function jsonRes(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('WebAuthProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('detects auth_code in URL', () => {
    window.history.replaceState({}, '', '/?auth_code=abc');
    expect(hasAuthCodeInUrl()).toBe(true);
  });

  it('exchanges auth_code and strips it from the URL', async () => {
    window.history.replaceState({}, '', '/?auth_code=one-time');
    fetchMock.mockResolvedValueOnce(
      jsonRes(200, {
        success: true,
        data: {
          token: {
            access_token: 'access-1',
            refresh_token: 'refresh-1',
            expires_in: 3600,
            token_type: 'Bearer',
          },
        },
      }),
    );

    const auth = createWebAuthModule({
      appId: 'test-app',
      apiBaseUrl: API_BASE,
      storageKey: STORAGE_KEY,
    });
    const ok = await auth.handleAuthCallback();

    expect(ok).toBe(true);
    expect(window.location.search).not.toContain('auth_code');
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/api/auth/code/exchange`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await auth.getAuthHeaders()).toEqual({ Authorization: 'Bearer access-1' });
    expect(hasWebAuthSession(STORAGE_KEY)).toBe(true);
  });

  it('reuses stored JWT without another exchange', async () => {
    const keys = {
      access: `${STORAGE_KEY}_access_token`,
      refresh: `${STORAGE_KEY}_refresh_token`,
      expiresAt: `${STORAGE_KEY}_access_expires_at`,
    };
    localStorage.setItem(keys.access, 'stored-access');
    localStorage.setItem(keys.refresh, 'stored-refresh');
    localStorage.setItem(keys.expiresAt, String(Date.now() + 60_000));

    const auth = new WebAuthProvider({
      appId: 'test-app',
      apiBaseUrl: API_BASE,
      storageKey: STORAGE_KEY,
    });

    expect(auth.isAuthenticated()).toBe(true);
    expect(await auth.getAuthHeaders()).toEqual({ Authorization: 'Bearer stored-access' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
