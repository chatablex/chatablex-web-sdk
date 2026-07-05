import type { Bridge } from '../bridge';
import type {
  ChatableXAuth,
  ChatableXOfficial,
  OfficialCapabilities,
  OfficialCatalog,
  OfficialCatalogEntry,
  OfficialDeprecateOptions,
  OfficialFile,
  OfficialPublishJob,
  OfficialPublishRequest,
} from '../types';

// ---------------------------------------------------------------------------
// Errors (instanceof-checkable; stable `.name` for consumer mapping)
// ---------------------------------------------------------------------------

/** Base error for all `sdk.official` failures. */
export class OfficialError extends Error {
  /** Business code from auth-fc (or the HTTP status when none was returned). */
  readonly code: number;
  constructor(message: string, code: number) {
    super(message);
    this.name = 'OfficialError';
    this.code = code;
  }
}

/** No authenticated session — the app should prompt the user to log in. */
export class OfficialAuthRequiredError extends OfficialError {
  constructor(message = 'official publishing requires an authenticated session') {
    super(message, 401);
    this.name = 'OfficialAuthRequiredError';
  }
}

/** The caller lacks the `can_publish/manage_official_resource` capability (FR-02). */
export class OfficialForbiddenError extends OfficialError {
  constructor(message = 'not authorized to publish/manage this official resource') {
    super(message, 40310);
    this.name = 'OfficialForbiddenError';
  }
}

/** A publish/manage call lost an optimistic-concurrency race — retry (FR-06). */
export class OfficialConflictError extends OfficialError {
  constructor(message = 'concurrency conflict, please retry') {
    super(message, 40910);
    this.name = 'OfficialConflictError';
  }
}

// ---------------------------------------------------------------------------
// Content hashing (mirrors service/official_adapter.go ComputeContentHash)
// ---------------------------------------------------------------------------

function decodeFileBytes(f: OfficialFile): Uint8Array {
  const enc = (f.encoding ?? 'utf8').toLowerCase();
  if (enc === 'base64') {
    const bin = atob(f.content);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new TextEncoder().encode(f.content);
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // copy into a fresh ArrayBuffer to satisfy BufferSource typing
  const buf = bytes.slice().buffer;
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return toHex(digest);
}

/**
 * Deterministically hashes a bundle's file contents. Order-independent and
 * independent of metadata; the server recomputes the same value (FR-04/09):
 *
 *   canonical = for each file sorted by path: "<path>\n<sha256hex(bytes)>\n"
 *   hash      = "sha256:" + sha256hex(canonical)
 */
export async function computeOfficialContentHash(files: OfficialFile[]): Promise<string> {
  const hashed = await Promise.all(
    files.map(async (f) => ({ path: f.path, sha: await sha256Hex(decodeFileBytes(f)) })),
  );
  hashed.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const canonical = hashed.map((h) => `${h.path}\n${h.sha}\n`).join('');
  const sum = await sha256Hex(new TextEncoder().encode(canonical));
  return `sha256:${sum}`;
}

// ---------------------------------------------------------------------------
// Wire types (snake_case from auth-fc)
// ---------------------------------------------------------------------------

interface ApiEnvelope<T> {
  success?: boolean;
  code?: number;
  message?: string;
  data?: T;
}

interface WireJob {
  job_id: string;
  app_id: string;
  resource_type: string;
  resource_id: string;
  content_hash: string;
  state: OfficialPublishJob['state'];
  content_version?: string;
  errors?: Array<{ field?: string; code: string; message: string }>;
  actor: string;
}

interface WireCatalogEntry {
  id: string;
  version: string;
  hash: string;
  base_url?: string;
  deprecated?: boolean;
  hidden_from_latest?: boolean;
  replacement_id?: string;
  entry?: Record<string, unknown>;
}

interface WireCatalog {
  app_id: string;
  resource_type: string;
  channel: string;
  etag: number;
  entries?: WireCatalogEntry[];
}

interface WireCapabilities {
  is_official?: boolean;
  wildcard?: boolean;
  scopes?: Array<{ app_id: string; resource_type: string; can_publish: boolean; can_manage: boolean }>;
}

function mapJob(w: WireJob): OfficialPublishJob {
  return {
    jobId: w.job_id,
    appId: w.app_id,
    resourceType: w.resource_type,
    resourceId: w.resource_id,
    contentHash: w.content_hash,
    state: w.state,
    contentVersion: w.content_version,
    errors: (w.errors ?? []).map((e) => ({ field: e.field, code: e.code, message: e.message })),
    actor: w.actor,
  };
}

function mapCatalogEntry(w: WireCatalogEntry): OfficialCatalogEntry {
  return {
    id: w.id,
    version: w.version,
    hash: w.hash,
    baseUrl: w.base_url,
    deprecated: w.deprecated,
    hiddenFromLatest: w.hidden_from_latest,
    replacementId: w.replacement_id,
    entry: w.entry,
  };
}

function mapCatalog(w: WireCatalog): OfficialCatalog {
  return {
    appId: w.app_id,
    resourceType: w.resource_type,
    channel: w.channel,
    etag: w.etag,
    entries: (w.entries ?? []).map(mapCatalogEntry),
  };
}

export interface OfficialModuleDeps {
  appId: string;
  auth: ChatableXAuth;
  apiBaseUrl?: string;
}

export function createOfficialModule(bridge: Bridge, deps: OfficialModuleDeps): ChatableXOfficial {
  const { auth } = deps;
  let resolvedBase: string | null = deps.apiBaseUrl ? stripTrailingSlash(deps.apiBaseUrl) : null;

  function stripTrailingSlash(url: string): string {
    return url.replace(/\/+$/, '');
  }

  async function baseUrl(): Promise<string> {
    if (resolvedBase) return resolvedBase;
    try {
      const r = await bridge.sendMessage('host.getApiBaseUrl', {}, 5_000);
      const url =
        typeof r === 'string'
          ? r
          : r && typeof r === 'object' && typeof (r as { base_url?: unknown }).base_url === 'string'
            ? (r as { base_url: string }).base_url
            : '';
      if (url) {
        resolvedBase = stripTrailingSlash(url);
        return resolvedBase;
      }
    } catch {
      // not hosted / unimplemented — fall through
    }
    throw new OfficialError(
      'official API base URL is not configured; pass apiBaseUrl to ChatableX.init()',
      0,
    );
  }

  async function authedFetch(path: string, init: RequestInit): Promise<Response> {
    const token = await auth.getToken();
    if (!token) throw new OfficialAuthRequiredError();

    const url = `${await baseUrl()}${path}`;
    const build = async (): Promise<RequestInit> => ({
      ...init,
      headers: { ...(init.headers ?? {}), ...(await auth.getAuthHeaders()) },
    });

    let res = await fetch(url, await build());
    if (res.status === 401 && (await auth.refresh())) {
      res = await fetch(url, await build());
    }
    return res;
  }

  function raise(status: number, code: number | undefined, message: string): never {
    if (code === 40310 || status === 403) throw new OfficialForbiddenError(message);
    if (status === 401) throw new OfficialAuthRequiredError(message);
    if (code === 40910 || status === 409) throw new OfficialConflictError(message);
    throw new OfficialError(message, code ?? status);
  }

  async function callApi<T>(path: string, init: RequestInit): Promise<T> {
    const res = await authedFetch(path, init);
    let body: ApiEnvelope<unknown> | null = null;
    try {
      body = (await res.json()) as ApiEnvelope<unknown>;
    } catch {
      // non-JSON
    }
    const code = body?.code;
    const message = body?.message || `HTTP ${res.status}`;
    if (!res.ok || body?.success === false) {
      raise(res.status, code, message);
    }
    return (body?.data ?? null) as T;
  }

  return {
    async publish(req: OfficialPublishRequest): Promise<OfficialPublishJob> {
      if (!req.appId || !req.resourceType || !req.resourceId) {
        throw new OfficialError('appId, resourceType and resourceId are required', 400);
      }
      const contentHash = req.contentHash ?? (await computeOfficialContentHash(req.files));
      const data = await callApi<WireJob>('/api/official/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: req.appId,
          resource_type: req.resourceType,
          resource_id: req.resourceId,
          content_hash: contentHash,
          metadata: req.metadata ?? {},
          files: req.files.map((f) => ({
            path: f.path,
            mime: f.mime,
            encoding: f.encoding ?? 'utf8',
            content: f.content,
          })),
        }),
      });
      return mapJob(data);
    },

    async getPublishJob(jobId: string): Promise<OfficialPublishJob> {
      const data = await callApi<WireJob>(`/api/official/publish/${encodeURIComponent(jobId)}`, {
        method: 'GET',
      });
      return mapJob(data);
    },

    async deprecate(
      appId: string,
      resourceType: string,
      resourceId: string,
      options: OfficialDeprecateOptions = {},
    ): Promise<void> {
      await callApi<unknown>(
        `/api/official/${encodeURIComponent(appId)}/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}/deprecate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hidden_from_latest: options.hiddenFromLatest ?? false,
            replacement_id: options.replacementId ?? '',
          }),
        },
      );
    },

    async rollback(
      appId: string,
      resourceType: string,
      resourceId: string,
      toVersion = '',
    ): Promise<void> {
      await callApi<unknown>(
        `/api/official/${encodeURIComponent(appId)}/${encodeURIComponent(resourceType)}/rollback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resource_id: resourceId, to_version: toVersion }),
        },
      );
    },

    async getCatalog(appId: string, resourceType: string, channel = 'latest'): Promise<OfficialCatalog> {
      // Public, anonymous, cacheable (FR-11) — no auth header.
      const url = `${await baseUrl()}/api/official/${encodeURIComponent(appId)}/${encodeURIComponent(resourceType)}/catalog?channel=${encodeURIComponent(channel)}`;
      const res = await fetch(url, { method: 'GET' });
      let body: ApiEnvelope<WireCatalog> | null = null;
      try {
        body = (await res.json()) as ApiEnvelope<WireCatalog>;
      } catch {
        // non-JSON
      }
      if (!res.ok || body?.success === false) {
        raise(res.status, body?.code, body?.message || `HTTP ${res.status}`);
      }
      const data = (body?.data ?? { app_id: appId, resource_type: resourceType, channel, etag: 0, entries: [] }) as WireCatalog;
      return mapCatalog(data);
    },

    async getCapabilities(): Promise<OfficialCapabilities> {
      const data = await callApi<WireCapabilities>('/api/me/official-capabilities', { method: 'GET' });
      return {
        isOfficial: data?.is_official ?? false,
        wildcard: data?.wildcard ?? false,
        scopes: (data?.scopes ?? []).map((s) => ({
          appId: s.app_id,
          resourceType: s.resource_type,
          canPublish: s.can_publish,
          canManage: s.can_manage,
        })),
      };
    },
  };
}
