import type { AuthTokenData, ChatableXAuth } from '../types';

type TokenPair = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
};

export interface WebAuthConfig {
  appId: string;
  apiBaseUrl: string;
  /** localStorage key prefix; default `chatablex_{appId}` */
  storageKey?: string;
}

function storageKeys(prefix: string) {
  return {
    access: `${prefix}_access_token`,
    refresh: `${prefix}_refresh_token`,
    expiresAt: `${prefix}_access_expires_at`,
  };
}

function parseJwtExp(accessToken: string): number | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
      sub?: string;
    };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function parseJwtSub(accessToken: string): string | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string };
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function resolveWebAuthStorageKey(appId: string, override?: string): string {
  return override ?? `chatablex_${appId}`;
}

export function hasAuthCodeInUrl(): boolean {
  if (typeof window === 'undefined') return false;
  return new URL(window.location.href).searchParams.has('auth_code');
}

export function hasWebAuthSession(storageKey: string): boolean {
  if (typeof window === 'undefined') return false;
  const keys = storageKeys(storageKey);
  const token = localStorage.getItem(keys.access);
  if (!token) return false;
  const exp = localStorage.getItem(keys.expiresAt);
  if (exp) {
    const t = Number(exp);
    if (!Number.isNaN(t) && Date.now() >= t) return false;
  }
  const jwtExp = parseJwtExp(token);
  if (jwtExp !== null && Date.now() >= jwtExp) return false;
  return true;
}

export function shouldBootstrapStandaloneWebAuth(
  config: { appId: string; apiBaseUrl?: string; webAuthStorageKey?: string; standalone?: boolean | 'auto' },
): boolean {
  if (config.standalone === false) return false;
  if (typeof window !== 'undefined' && window.ChatableXBridge) return false;
  if (!config.apiBaseUrl?.trim()) return false;
  const storageKey = resolveWebAuthStorageKey(config.appId, config.webAuthStorageKey);
  if (config.standalone === true) return true;
  return hasAuthCodeInUrl() || hasWebAuthSession(storageKey);
}

/**
 * Browser auth for WebView → system browser handoff (`?auth_code=`).
 * Persists JWT in localStorage and feeds `sdk.auth` + `sdk.cloud`.
 */
export class WebAuthProvider implements ChatableXAuth {
  private readonly _keys: ReturnType<typeof storageKeys>;
  private readonly _apiBase: string;
  private _token: AuthTokenData | null = null;
  private _refreshing: Promise<boolean> | null = null;

  constructor(config: WebAuthConfig) {
    this._apiBase = config.apiBaseUrl.replace(/\/+$/, '');
    const prefix = resolveWebAuthStorageKey(config.appId, config.storageKey);
    this._keys = storageKeys(prefix);
    this._hydrateFromStorage();
  }

  private _hydrateFromStorage(): void {
    const access = localStorage.getItem(this._keys.access);
    if (!access) {
      this._token = null;
      return;
    }
    const storedExp = Number(localStorage.getItem(this._keys.expiresAt) || 0);
    const jwtExp = parseJwtExp(access);
    const expiresAt = storedExp || jwtExp || 0;
    if (expiresAt && expiresAt <= Date.now()) {
      this._token = null;
      return;
    }
    this._token = {
      access_token: access,
      expires_at: expiresAt,
      user_id: parseJwtSub(access) ?? '',
    };
  }

  /** Exchange `?auth_code=` once on startup; strips the param from the URL. */
  async handleAuthCallback(): Promise<boolean> {
    if (typeof window === 'undefined') return this.isAuthenticated();
    const url = new URL(window.location.href);
    const code = url.searchParams.get('auth_code');
    if (!code) return this.isAuthenticated();

    const ok = await this._exchangeAuthCode(code);
    url.searchParams.delete('auth_code');
    window.history.replaceState({}, '', url.toString());
    return ok;
  }

  private async _exchangeAuthCode(code: string): Promise<boolean> {
    const res = await fetch(`${this._apiBase}/api/auth/code/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const body = (await res.json()) as {
      success: boolean;
      data?: { token: TokenPair; user: unknown };
    };
    if (!body.success || !body.data?.token) {
      this._token = null;
      return false;
    }
    this._persistTokenPair(body.data.token);
    return true;
  }

  private _persistTokenPair(token: TokenPair): void {
    localStorage.setItem(this._keys.access, token.access_token);
    localStorage.setItem(this._keys.refresh, token.refresh_token);
    const expMs = Date.now() + token.expires_in * 1000;
    localStorage.setItem(this._keys.expiresAt, String(expMs));
    this._token = {
      access_token: token.access_token,
      expires_at: expMs,
      user_id: parseJwtSub(token.access_token) ?? '',
    };
  }

  async getToken(): Promise<AuthTokenData | null> {
    if (this._token && this._token.expires_at > Date.now()) return this._token;
    const ok = await this.refresh();
    return ok ? this._token : null;
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token.access_token}` };
  }

  getUserId(): string | null {
    return this._token?.user_id || null;
  }

  isAuthenticated(): boolean {
    return !!this._token && this._token.expires_at > Date.now();
  }

  refresh(): Promise<boolean> {
    if (this._refreshing) return this._refreshing;
    this._refreshing = this._doRefresh().finally(() => {
      this._refreshing = null;
    });
    return this._refreshing;
  }

  private async _doRefresh(): Promise<boolean> {
    this._hydrateFromStorage();
    if (this._token && this._token.expires_at > Date.now()) return true;

    const refreshToken = localStorage.getItem(this._keys.refresh);
    if (!refreshToken) {
      this._token = null;
      return false;
    }

    try {
      const res = await fetch(`${this._apiBase}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      const body = (await res.json()) as {
        success: boolean;
        data?: { token: TokenPair };
      };
      if (!body.success || !body.data?.token) {
        this._token = null;
        return false;
      }
      this._persistTokenPair(body.data.token);
      return true;
    } catch {
      this._token = null;
      return false;
    }
  }
}

export function createWebAuthModule(config: WebAuthConfig): WebAuthProvider {
  return new WebAuthProvider(config);
}
