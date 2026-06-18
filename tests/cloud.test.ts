import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockHost, DEFAULT_SDK_INIT_RESPONSE } from './helpers/mockHost';
import type { HostResponse } from './helpers/mockHost';

const API_BASE = 'https://api.test';

const FUTURE = () => Date.now() + 60 * 60 * 1000;

function authResponse(overrides: Record<string, unknown> = {}): HostResponse {
  return {
    success: true,
    data: { access_token: 'tok-1', expires_at: FUTURE(), user_id: 'u-42', ...overrides },
  };
}

/** Minimal fetch Response stand-in (jsdom has no fetch). */
function jsonRes(status: number, envelope: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => envelope,
    blob: async () => new Blob([]),
  } as unknown as Response;
}
function binRes(status: number, blob: Blob) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
    blob: async () => blob,
  } as unknown as Response;
}

type FetchCall = { url: string; init: RequestInit };

describe('sdk.cloud', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let calls: FetchCall[];

  beforeEach(() => {
    vi.resetModules();
    delete window.ChatableX;
    delete window.ChatableXBridge;
    delete window.ChatableXReceive;
    delete window.__CHATABLEX_DISPATCH__;

    calls = [];
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function initSdk(responses: Record<string, HostResponse> = {}, apiBaseUrl = API_BASE) {
    const host = createMockHost({
      responses: { sdk_init: DEFAULT_SDK_INIT_RESPONSE, 'host.getAuthToken': authResponse(), ...responses },
    });
    const { ChatableX } = await import('../src/index');
    const sdk = await ChatableX.init({ appId: 'test-app', apiBaseUrl });
    return { host, sdk };
  }

  /** Route fetch by URL; record every call. */
  function route(handler: (url: string, init: RequestInit) => Response) {
    fetchMock.mockImplementation((url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return Promise.resolve(handler(url, init));
    });
  }

  it('exposes the full cloud interface', async () => {
    const { sdk } = await initSdk();
    expect(sdk.cloud).toBeDefined();
    for (const m of ['upload', 'download', 'getDownloadUrl', 'list', 'delete', 'usage'] as const) {
      expect(typeof sdk.cloud[m]).toBe('function');
    }
  });

  it('upload: signs URL with auto-injected app_id, then PUTs to OSS', async () => {
    const { sdk } = await initSdk();
    route((url) => {
      if (url.includes('/api/storage/upload-url')) {
        return jsonRes(200, {
          success: true,
          code: 0,
          data: { upload_url: 'https://oss.test/put?sig=1', object_key: 'user-data/u-42/test-app/foo.json', expires_in: 3600 },
        });
      }
      if (url.startsWith('https://oss.test/put')) return jsonRes(200, {});
      throw new Error(`unexpected url ${url}`);
    });

    const result = await sdk.cloud.upload('foo.json', '{"a":1}', { contentType: 'application/json' });

    const sign = calls.find((c) => c.url.includes('/api/storage/upload-url'))!;
    expect(sign.init.method).toBe('POST');
    expect(JSON.parse(sign.init.body as string)).toMatchObject({
      app_id: 'test-app',
      file_key: 'foo.json',
      content_type: 'application/json',
    });
    expect((sign.init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');

    const put = calls.find((c) => c.url.startsWith('https://oss.test/put'))!;
    expect(put.init.method).toBe('PUT');
    expect((put.init.headers as Record<string, string>)['Content-Type']).toBe('application/json');

    expect(result).toMatchObject({
      fileKey: 'foo.json',
      objectKey: 'user-data/u-42/test-app/foo.json',
      contentType: 'application/json',
    });
    expect(result.size).toBeGreaterThan(0);
  });

  it('upload: maps quota_exceeded (40301) to CloudQuotaExceededError', async () => {
    const { sdk } = await initSdk();
    const { CloudQuotaExceededError } = await import('../src/index');
    route((url) => {
      if (url.includes('/api/storage/upload-url')) {
        return jsonRes(403, {
          success: false,
          code: 40301,
          message: 'quota_exceeded',
          data: { used_bytes: 100, quota_bytes: 100 },
        });
      }
      throw new Error(`unexpected url ${url}`);
    });

    await expect(sdk.cloud.upload('foo.json', 'x')).rejects.toBeInstanceOf(CloudQuotaExceededError);
    // OSS PUT must NOT be attempted after a failed sign.
    expect(calls.some((c) => c.url.startsWith('https://oss.test'))).toBe(false);
  });

  it('upload: maps subscription_required (40302) to CloudSubscriptionRequiredError', async () => {
    const { sdk } = await initSdk();
    const { CloudSubscriptionRequiredError } = await import('../src/index');
    route((url) => {
      if (url.includes('/api/storage/upload-url')) {
        return jsonRes(403, { success: false, code: 40302, message: 'subscription_required' });
      }
      throw new Error(`unexpected url ${url}`);
    });

    await expect(sdk.cloud.upload('foo.json', 'x')).rejects.toBeInstanceOf(CloudSubscriptionRequiredError);
  });

  it('rejects with CloudAuthRequiredError and sends no request when unauthenticated', async () => {
    const { sdk } = await initSdk({ 'host.getAuthToken': { success: true, data: { error: 'not_authenticated' } } });
    const { CloudAuthRequiredError } = await import('../src/index');
    route(() => jsonRes(200, { success: true, data: {} }));

    await expect(sdk.cloud.usage()).rejects.toBeInstanceOf(CloudAuthRequiredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes and retries once on 401', async () => {
    const { sdk } = await initSdk();
    let usageHits = 0;
    route((url) => {
      if (url.includes('/api/storage/usage')) {
        usageHits += 1;
        if (usageHits === 1) return jsonRes(401, { success: false, code: 401, message: 'token expired' });
        return jsonRes(200, { success: true, data: { used_bytes: 1, quota_bytes: 10, file_count: 2 } });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const usage = await sdk.cloud.usage();
    expect(usageHits).toBe(2);
    expect(usage).toEqual({ usedBytes: 1, quotaBytes: 10, fileCount: 2, reconciledAt: undefined });
  });

  it('download: signs a download URL then GETs the blob', async () => {
    const { sdk } = await initSdk();
    const payload = new Blob(['hello']);
    route((url) => {
      if (url.includes('/api/storage/download-url')) {
        return jsonRes(200, {
          success: true,
          data: { download_url: 'https://oss.test/get?sig=2', object_key: 'k', expires_in: 3600 },
        });
      }
      if (url.startsWith('https://oss.test/get')) return binRes(200, payload);
      throw new Error(`unexpected url ${url}`);
    });

    const blob = await sdk.cloud.download('foo.json');
    expect(blob).toBe(payload);
    const sign = calls.find((c) => c.url.includes('/api/storage/download-url'))!;
    expect(JSON.parse(sign.init.body as string)).toMatchObject({ app_id: 'test-app', file_key: 'foo.json' });
  });

  it('getDownloadUrl returns the presigned URL', async () => {
    const { sdk } = await initSdk();
    route(() => jsonRes(200, { success: true, data: { download_url: 'https://oss.test/get?sig=9', object_key: 'k', expires_in: 3600 } }));
    expect(await sdk.cloud.getDownloadUrl('foo.json')).toBe('https://oss.test/get?sig=9');
  });

  it('list: passes app_id + prefix and maps snake_case to camelCase', async () => {
    const { sdk } = await initSdk();
    route((url) =>
      jsonRes(200, {
        success: true,
        data: { files: [{ file_key: 'a.json', size: 10, last_modified: '2026-01-01T00:00:00Z' }], total: 1 },
      }),
    );

    const files = await sdk.cloud.list({ prefix: 'canvases/' });
    const call = calls[0];
    expect(call.url).toContain('app_id=test-app');
    expect(call.url).toContain('prefix=canvases');
    expect(files).toEqual([{ fileKey: 'a.json', size: 10, lastModified: '2026-01-01T00:00:00Z' }]);
  });

  it('delete: sends DELETE with app_id + file_key', async () => {
    const { sdk } = await initSdk();
    route(() => jsonRes(200, { success: true, data: { deleted: true } }));
    await sdk.cloud.delete('foo.json');
    expect(calls[0].init.method).toBe('DELETE');
    expect(calls[0].url).toContain('app_id=test-app');
    expect(calls[0].url).toContain('file_key=foo.json');
  });

  it('usage: maps fields including reconciled_at', async () => {
    const { sdk } = await initSdk();
    route(() =>
      jsonRes(200, {
        success: true,
        data: { used_bytes: 5, quota_bytes: 100, file_count: 3, reconciled_at: '2026-01-02T00:00:00Z' },
      }),
    );
    expect(await sdk.cloud.usage()).toEqual({
      usedBytes: 5,
      quotaBytes: 100,
      fileCount: 3,
      reconciledAt: '2026-01-02T00:00:00Z',
    });
  });

  it('resolves base URL from the host when apiBaseUrl is not configured', async () => {
    const { sdk } = await initSdk({ 'host.getApiBaseUrl': { success: true, data: 'https://host.test/' } }, '' /* no explicit base */);
    route((url) => {
      expect(url.startsWith('https://host.test/api/storage/usage')).toBe(true);
      return jsonRes(200, { success: true, data: { used_bytes: 0, quota_bytes: 1, file_count: 0 } });
    });
    await sdk.cloud.usage();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('errors clearly when no base URL can be resolved', async () => {
    // host replies with an empty base URL → cannot resolve.
    const { sdk } = await initSdk({ 'host.getApiBaseUrl': { success: true, data: '' } }, '');
    const { CloudError } = await import('../src/index');
    route(() => jsonRes(200, { success: true, data: {} }));
    await expect(sdk.cloud.usage()).rejects.toBeInstanceOf(CloudError);
  });
});
