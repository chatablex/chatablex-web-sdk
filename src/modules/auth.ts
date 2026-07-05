import type { Bridge } from '../bridge';
import type { AuthTokenData, ChatableXAuth } from '../types';

/**
 * Strategy interface behind `sdk.auth`. Lets us swap how a token is obtained
 * (hosted WebView today, browser/unified-login later) without touching any
 * consumer code or the public `ChatableXAuth` surface.
 */
export interface AuthProvider extends ChatableXAuth {}

/** Treat a token as expired this many ms before its real `expires_at`. */
const EXPIRY_SKEW_MS = 5_000;

/** Shape of the host reply to `host.getAuthToken`. */
type HostAuthResponse =
  | { access_token: string; expires_at: number; user_id: string; error?: undefined }
  | { error: string; access_token?: undefined };

function isValid(token: AuthTokenData | null, now: number): token is AuthTokenData {
  return !!token && typeof token.access_token === 'string' && token.access_token.length > 0
    && token.expires_at - EXPIRY_SKEW_MS > now;
}

/**
 * Auth provider that reuses the desktop host's login session over the bridge.
 * Token lives in memory only; the refresh_token never crosses the bridge —
 * the host refreshes before sending (see FR-05).
 */
export class HostAuthProvider implements AuthProvider {
  private _bridge: Bridge;
  private _token: AuthTokenData | null = null;
  /** In-flight refresh, so concurrent callers share one host round-trip. */
  private _refreshing: Promise<boolean> | null = null;

  constructor(bridge: Bridge) {
    this._bridge = bridge;
  }

  async getToken(): Promise<AuthTokenData | null> {
    if (isValid(this._token, Date.now())) return this._token;
    const ok = await this.refresh();
    return ok ? this._token : null;
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token.access_token}` };
  }

  getUserId(): string | null {
    return this._token?.user_id ?? null;
  }

  isAuthenticated(): boolean {
    return isValid(this._token, Date.now());
  }

  refresh(): Promise<boolean> {
    // single-flight: merge concurrent refreshes into one host round-trip
    if (this._refreshing) return this._refreshing;
    this._refreshing = this._doRefresh().finally(() => {
      this._refreshing = null;
    });
    return this._refreshing;
  }

  private async _doRefresh(): Promise<boolean> {
    try {
      const raw = (await this._bridge.sendMessage('host.getAuthToken')) as HostAuthResponse | null;
      if (
        raw &&
        typeof raw === 'object' &&
        typeof raw.access_token === 'string' &&
        raw.access_token.length > 0
      ) {
        this._token = {
          access_token: raw.access_token,
          expires_at: Number(raw.expires_at) || 0,
          user_id: String(raw.user_id ?? ''),
        };
        return true;
      }
      // not authenticated / not hosted / host returned { error }
      this._token = null;
      return false;
    } catch {
      // bridge unavailable (non-WebView) or host error — degrade safely
      this._token = null;
      return false;
    }
  }
}

/**
 * Build the `auth` module. Selects the provider for the current environment;
 * today there is only `HostAuthProvider`. Browser sessions use `WebAuthProvider`
 * via standalone `ChatableX.init()` (see `modules/webAuth.ts`).
 */
export function createAuthModule(bridge: Bridge): ChatableXAuth {
  return new HostAuthProvider(bridge);
}
