# 示例：用 `sdk.auth` 做真实鉴权请求

演示「**应用零鉴权样板**」：`ChatableX.init()` 之后，任何需要登录态的后端请求
只需附加 `await sdk.auth.getAuthHeaders()`。宿主（桌面端 WebView）会自动复用用户
的登录态，并在下发前刷新 Token。

> 适用对象：所有 WebUI 应用。首个消费方为 math-studio 的场景云同步
> （见 math-studio `docs/prd/platform/prd-host-auth-202606`）。

## 1. 初始化

```ts
import { ChatableX } from 'chatablex-web-sdk';

const sdk = await ChatableX.init({ appId: 'my-app' });
```

## 2. 封装一个带鉴权 + 401 重试的 fetch

```ts
/** 带宿主登录态的 fetch；401 时刷新一次并重试。 */
async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const withAuth = async (): Promise<RequestInit> => ({
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
      ...(await sdk.auth.getAuthHeaders()), // {} 当未登录/非 WebView
    },
  });

  let res = await fetch(input, await withAuth());

  // access_token 失效兜底：刷新成功则重试一次
  if (res.status === 401 && (await sdk.auth.refresh())) {
    res = await fetch(input, await withAuth());
  }
  return res;
}
```

## 3. 业务调用

```ts
// 读取登录态：未登录时禁用云功能，提示用户去桌面端登录
if (!sdk.auth.isAuthenticated()) {
  // 先触发一次取 Token（hosted 且已登录时会命中）
  await sdk.auth.getToken();
}

if (sdk.auth.isAuthenticated()) {
  const userId = sdk.auth.getUserId();
  const res = await authedFetch('https://api.example.com/scenes');
  const scenes = await res.json();
  // ... 渲染该用户的云端数据
} else {
  // 展示「请在 ChatableX 桌面端登录后使用云同步」
}
```

## 关键点

- **不要自己实现登录或存 Token**：`sdk.auth` 是唯一入口。
- **不要持久化 Token**：hosted 下仅内存；`refresh_token` 永不下发到 WebView。
- **降级即可用**：非 WebView / 未登录时 `getAuthHeaders()` 返回 `{}` 且不抛异常，
  据 `isAuthenticated()` 决定是否禁用需鉴权的功能。
