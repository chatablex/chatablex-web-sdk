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

function jsonRes(status: number, envelope: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => envelope,
  } as unknown as Response;
}

type FetchCall = { url: string; init: RequestInit };

const SAMPLE_FILES = [
  { path: 'component.json', mime: 'application/json', content: '{"id":"official-x","name":"X"}' },
  { path: 'definition.json', mime: 'application/json', content: '{"objects":[]}' },
];

describe('sdk.official', () => {
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
    const sdk = await ChatableX.init({ appId: 'math-studio', apiBaseUrl });
    return { host, sdk };
  }

  function route(handler: (url: string, init: RequestInit) => Response) {
    fetchMock.mockImplementation((url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return Promise.resolve(handler(url, init));
    });
  }

  it('exposes the full official interface', async () => {
    const { sdk } = await initSdk();
    expect(sdk.official).toBeDefined();
    for (const m of ['publish', 'getPublishJob', 'deprecate', 'rollback', 'getCatalog', 'getCapabilities'] as const) {
      expect(typeof sdk.official[m]).toBe('function');
    }
  });

  it('publish: posts snake_case body with auto-computed content_hash + auth header', async () => {
    const { sdk } = await initSdk();
    route((url) => {
      if (url.includes('/api/official/publish')) {
        return jsonRes(200, {
          success: true,
          code: 0,
          data: {
            job_id: 'job_abc',
            app_id: 'math-studio',
            resource_type: 'component',
            resource_id: 'official-x',
            content_hash: 'sha256:zzz',
            state: 'published',
            content_version: 'content-v1',
            errors: [],
            actor: 'uid:42',
          },
        });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const job = await sdk.official.publish({
      appId: 'math-studio',
      resourceType: 'component',
      resourceId: 'official-x',
      metadata: { name: 'X' },
      files: SAMPLE_FILES,
    });

    const call = calls.find((c) => c.url.includes('/api/official/publish'))!;
    expect(call.init.method).toBe('POST');
    const body = JSON.parse(call.init.body as string);
    expect(body).toMatchObject({ app_id: 'math-studio', resource_type: 'component', resource_id: 'official-x' });
    expect(body.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(body.files[0]).toMatchObject({ path: 'component.json', encoding: 'utf8' });
    expect((call.init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');

    expect(job.state).toBe('published');
    expect(job.contentVersion).toBe('content-v1');
  });

  it('publish: maps 403 to OfficialForbiddenError', async () => {
    const { sdk } = await initSdk();
    const { OfficialForbiddenError } = await import('../src/index');
    route(() => jsonRes(403, { success: false, code: 40310, message: 'forbidden' }));
    await expect(
      sdk.official.publish({ appId: 'math-studio', resourceType: 'component', resourceId: 'x', files: SAMPLE_FILES }),
    ).rejects.toBeInstanceOf(OfficialForbiddenError);
  });

  it('getCatalog: anonymous GET (no auth header) and maps snake_case entries', async () => {
    const { sdk } = await initSdk();
    route((url) => {
      expect(url).toContain('/api/official/math-studio/component/catalog');
      expect(url).toContain('channel=latest');
      return jsonRes(200, {
        success: true,
        data: {
          app_id: 'math-studio',
          resource_type: 'component',
          channel: 'latest',
          etag: 3,
          entries: [{ id: 'official-x', version: 'content-v1', hash: 'sha256:zzz', base_url: 'https://cdn/x/', entry: { name: 'X' } }],
        },
      });
    });

    const cat = await sdk.official.getCatalog('math-studio', 'component');
    const call = calls[0];
    expect((call.init.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined();
    expect(cat.etag).toBe(3);
    expect(cat.entries[0]).toMatchObject({ id: 'official-x', version: 'content-v1', baseUrl: 'https://cdn/x/' });
  });

  it('rollback: posts resource_id + to_version', async () => {
    const { sdk } = await initSdk();
    route(() => jsonRes(200, { success: true, data: { rolled_back: true } }));
    await sdk.official.rollback('math-studio', 'component', 'official-x', 'content-v1');
    const call = calls[0];
    expect(call.url).toContain('/api/official/math-studio/component/rollback');
    expect(JSON.parse(call.init.body as string)).toEqual({ resource_id: 'official-x', to_version: 'content-v1' });
  });

  it('deprecate: posts hidden_from_latest + replacement_id', async () => {
    const { sdk } = await initSdk();
    route(() => jsonRes(200, { success: true, data: { deprecated: true } }));
    await sdk.official.deprecate('math-studio', 'component', 'official-x', { hiddenFromLatest: true, replacementId: 'official-y' });
    const call = calls[0];
    expect(call.url).toContain('/api/official/math-studio/component/official-x/deprecate');
    expect(JSON.parse(call.init.body as string)).toEqual({ hidden_from_latest: true, replacement_id: 'official-y' });
  });

  it('getCapabilities: maps wildcard + scopes', async () => {
    const { sdk } = await initSdk();
    route(() =>
      jsonRes(200, {
        success: true,
        data: { is_official: true, wildcard: true, scopes: [{ app_id: 'math-studio', resource_type: 'component', can_publish: true, can_manage: true }] },
      }),
    );
    const caps = await sdk.official.getCapabilities();
    expect(caps.wildcard).toBe(true);
    expect(caps.scopes[0]).toEqual({ appId: 'math-studio', resourceType: 'component', canPublish: true, canManage: true });
  });

  it('computeOfficialContentHash is order-independent', async () => {
    const { computeOfficialContentHash } = await import('../src/index');
    const a = await computeOfficialContentHash([
      { path: 'b.json', mime: 'application/json', content: '1' },
      { path: 'a.json', mime: 'application/json', content: '2' },
    ]);
    const b = await computeOfficialContentHash([
      { path: 'a.json', mime: 'application/json', content: '2' },
      { path: 'b.json', mime: 'application/json', content: '1' },
    ]);
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
