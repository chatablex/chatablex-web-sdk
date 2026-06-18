import type { Bridge } from '../bridge';
import type {
  ChatableXAuth,
  ChatableXCloud,
  CloudFileInfo,
  CloudListOptions,
  CloudUploadData,
  CloudUploadOptions,
  CloudUploadResult,
  CloudUsage,
} from '../types';

// ---------------------------------------------------------------------------
// Errors (instanceof-checkable so apps can branch their UI)
// ---------------------------------------------------------------------------

/** Base error for all `sdk.cloud` failures. */
export class CloudError extends Error {
  /** Business code from auth-fc (or the HTTP status when none was returned). */
  readonly code: number;
  constructor(message: string, code: number) {
    super(message);
    this.name = 'CloudError';
    this.code = code;
  }
}

/**
 * Thrown when no authenticated session is available. The app should prompt the
 * user to log in to ChatableX before retrying.
 */
export class CloudAuthRequiredError extends CloudError {
  constructor(message = 'cloud storage requires an authenticated session') {
    super(message, 401);
    this.name = 'CloudAuthRequiredError';
  }
}

/**
 * Thrown when the user lacks the entitlement (purchased tool / membership)
 * required to write to cloud storage. Maps to auth-fc code `40302`.
 */
export class CloudSubscriptionRequiredError extends CloudError {
  constructor(message = 'cloud storage requires an active subscription') {
    super(message, 40302);
    this.name = 'CloudSubscriptionRequiredError';
  }
}

/** Thrown when the upload would exceed the user's storage quota (code `40301`). */
export class CloudQuotaExceededError extends CloudError {
  readonly usedBytes: number;
  readonly quotaBytes: number;
  constructor(usedBytes: number, quotaBytes: number, message = 'storage quota exceeded') {
    super(message, 40301);
    this.name = 'CloudQuotaExceededError';
    this.usedBytes = usedBytes;
    this.quotaBytes = quotaBytes;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

/** auth-fc response envelope: { success, code, message, data }. */
interface ApiEnvelope<T> {
  success?: boolean;
  code?: number;
  message?: string;
  data?: T;
}

interface UploadURLData {
  upload_url: string;
  object_key: string;
  expires_in: number;
}
interface DownloadURLData {
  download_url: string;
  object_key: string;
  expires_in: number;
}
interface ListFilesData {
  files: Array<{ file_key: string; size: number; last_modified: string }>;
  total: number;
}
interface UsageData {
  used_bytes: number;
  quota_bytes: number;
  file_count: number;
  reconciled_at?: string;
}
interface QuotaErrorData {
  used_bytes?: number;
  quota_bytes?: number;
}

function normalizeData(data: CloudUploadData): { body: BodyInit; size: number; type: string } {
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return { body: data, size: data.size, type: data.type || '' };
  }
  if (typeof data === 'string') {
    const blob = new Blob([data]);
    return { body: blob, size: blob.size, type: '' };
  }
  if (data instanceof ArrayBuffer) {
    return { body: data, size: data.byteLength, type: '' };
  }
  if (ArrayBuffer.isView(data)) {
    return { body: data as unknown as BodyInit, size: data.byteLength, type: '' };
  }
  throw new CloudError('unsupported upload data type', 400);
}

export interface CloudModuleDeps {
  appId: string;
  auth: ChatableXAuth;
  /** Explicit cloud API base URL (overrides the host-provided one). */
  apiBaseUrl?: string;
}

export function createCloudModule(bridge: Bridge, deps: CloudModuleDeps): ChatableXCloud {
  const { appId, auth } = deps;
  let resolvedBase: string | null = deps.apiBaseUrl ? stripTrailingSlash(deps.apiBaseUrl) : null;

  function stripTrailingSlash(url: string): string {
    return url.replace(/\/+$/, '');
  }

  /** Resolve the cloud API base URL: explicit config > host bridge > error. */
  async function baseUrl(): Promise<string> {
    if (resolvedBase) return resolvedBase;
    try {
      // Short timeout: a hosted-but-unimplemented method shouldn't hang the call.
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
      // host doesn't implement it / not hosted — fall through to error
    }
    throw new CloudError(
      'cloud API base URL is not configured; pass apiBaseUrl to ChatableX.init()',
      0,
    );
  }

  /**
   * fetch against auth-fc that injects the host login session and retries once
   * on 401 after letting `sdk.auth` refresh. Rejects with CloudAuthRequiredError
   * when there is no valid token (no unauthenticated request is sent).
   */
  async function authedFetch(path: string, init: RequestInit): Promise<Response> {
    const token = await auth.getToken();
    if (!token) throw new CloudAuthRequiredError();

    const base = await baseUrl();
    const url = `${base}${path}`;

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

  /** Call an auth-fc JSON endpoint and unwrap the `data` payload. */
  async function callApi<T>(path: string, init: RequestInit): Promise<T> {
    const res = await authedFetch(path, init);

    let body: ApiEnvelope<unknown> | null = null;
    try {
      body = (await res.json()) as ApiEnvelope<unknown>;
    } catch {
      // non-JSON body
    }

    const code = body?.code;
    const message = body?.message || `HTTP ${res.status}`;

    if (!res.ok || body?.success === false) {
      if (code === 40301) {
        const q = (body?.data ?? {}) as QuotaErrorData;
        throw new CloudQuotaExceededError(q.used_bytes ?? 0, q.quota_bytes ?? 0, message);
      }
      if (code === 40302) throw new CloudSubscriptionRequiredError(message);
      if (res.status === 401) throw new CloudAuthRequiredError(message);
      throw new CloudError(message, code ?? res.status);
    }

    return (body?.data ?? null) as T;
  }

  function validateFileKey(fileKey: string): void {
    if (!fileKey || typeof fileKey !== 'string') {
      throw new CloudError('fileKey is required', 400);
    }
  }

  return {
    async upload(
      fileKey: string,
      data: CloudUploadData,
      options: CloudUploadOptions = {},
    ): Promise<CloudUploadResult> {
      validateFileKey(fileKey);
      const { body, size, type } = normalizeData(data);
      const contentType = options.contentType || type || DEFAULT_CONTENT_TYPE;

      const signed = await callApi<UploadURLData>('/api/storage/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          file_key: fileKey,
          content_type: contentType,
          size_bytes: size,
        }),
      });

      // Direct client → OSS PUT. Content-Type MUST match what was signed.
      const put = await fetch(signed.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body,
      });
      if (!put.ok) {
        throw new CloudError(`OSS upload failed: HTTP ${put.status}`, put.status);
      }

      return { fileKey, objectKey: signed.object_key, size, contentType };
    },

    async getDownloadUrl(fileKey: string): Promise<string> {
      validateFileKey(fileKey);
      const signed = await callApi<DownloadURLData>('/api/storage/download-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, file_key: fileKey }),
      });
      return signed.download_url;
    },

    async download(fileKey: string): Promise<Blob> {
      const url = await this.getDownloadUrl(fileKey);
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        throw new CloudError(`OSS download failed: HTTP ${res.status}`, res.status);
      }
      return res.blob();
    },

    async list(options: CloudListOptions = {}): Promise<CloudFileInfo[]> {
      const qs = new URLSearchParams({ app_id: appId });
      if (options.prefix) qs.set('prefix', options.prefix);
      const data = await callApi<ListFilesData>(`/api/storage/files?${qs.toString()}`, {
        method: 'GET',
      });
      return (data?.files ?? []).map((f) => ({
        fileKey: f.file_key,
        size: f.size,
        lastModified: f.last_modified,
      }));
    },

    async delete(fileKey: string): Promise<void> {
      validateFileKey(fileKey);
      const qs = new URLSearchParams({ app_id: appId, file_key: fileKey });
      await callApi<unknown>(`/api/storage/files?${qs.toString()}`, { method: 'DELETE' });
    },

    async usage(): Promise<CloudUsage> {
      const data = await callApi<UsageData>('/api/storage/usage', { method: 'GET' });
      return {
        usedBytes: data.used_bytes,
        quotaBytes: data.quota_bytes,
        fileCount: data.file_count,
        reconciledAt: data.reconciled_at,
      };
    },
  };
}
