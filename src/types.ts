/**
 * ChatableX Web SDK — Type Definitions
 */

// ---------------------------------------------------------------------------
// Chat / AI
// ---------------------------------------------------------------------------

export interface ChatOptions {
  sessionId?: string;
  context?: Record<string, unknown>;
  tools?: string[];
  skills?: string[];
  stream?: boolean;
}

export interface ChatResponse {
  content: string;
  sessionId: string;
  messageId: string;
  toolResults?: ToolResult[];
  finished: boolean;
  model?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface SessionContext {
  sessionId: string;
  name: string;
  messages: Message[];
  activeTools: string[];
  activeSkills: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export interface ToolInfo {
  id: string;
  name: string;
  version: string;
  description: string;
}

export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
}

export interface ToolCall {
  id: string;
  toolId: string;
  name: string;
  params: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error' | 'cancelled';
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  toolId: string;
  duration?: number;
}

export type ToolExecuteHandler = (params: Record<string, unknown>) => Promise<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface FilePickerOptions {
  type?: 'any' | 'image' | 'video' | 'audio' | 'custom';
  multiple?: boolean;
  allowedExtensions?: string[];
}

export interface TabConfig {
  id: string;
  title: string;
  icon?: string;
  type: 'chat' | 'tool' | 'skill' | 'custom';
  data?: Record<string, unknown>;
}

export interface StateUpdate {
  refreshMessages?: boolean;
  closeWebUI?: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type EventType =
  | 'aiResponse'
  | 'toolExecution'
  | 'userMessage'
  | 'streamingContent'
  | 'close';

export interface AiResponseEventData extends ChatResponse {}

export interface ToolExecutionEventData {
  toolCall: ToolCall;
  result?: ToolResult;
}

export interface UserMessageEventData {
  message: string;
  timestamp: string;
}

export interface StreamingContentEventData {
  content: string;
  finished?: boolean;
}

export interface CloseEventData {
  toolId: string;
}

export interface EventCallbackMap {
  aiResponse: (data: AiResponseEventData) => void;
  toolExecution: (data: ToolExecutionEventData) => void;
  userMessage: (data: UserMessageEventData) => void;
  streamingContent: (data: StreamingContentEventData) => void;
  close: (data: CloseEventData) => void;
}

export type Unsubscribe = () => void;

// ---------------------------------------------------------------------------
// Init Config
// ---------------------------------------------------------------------------

export interface ChatableXInitConfig {
  /** Your app / tool id (must match manifest.json id) */
  appId: string;
  /** SDK version override (default: SDK built-in version) */
  version?: string;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Timeout in ms for the handshake with Flutter (default: 10000) */
  timeout?: number;
  /**
   * Base URL of the ChatableX cloud API (auth-fc), e.g.
   * `https://chatabl-fc-prod-xxxx.cn-hangzhou.fcapp.run`. Required for
   * `sdk.cloud` to work. When omitted, the SDK best-effort asks the host via
   * the `host.getApiBaseUrl` bridge call; if that is also unavailable, cloud
   * calls reject with a clear error.
   */
  apiBaseUrl?: string;
  /** Agent lock configuration — blocks user input during tool execution. */
  agentLock?: AgentLockConfig;
}

// ---------------------------------------------------------------------------
// SDK Module Interfaces
// ---------------------------------------------------------------------------

export interface ChatableXAI {
  chat(message: string, options?: ChatOptions): Promise<ChatResponse>;
  chatStream(message: string, options?: ChatOptions): Promise<unknown>;
  getContext(): Promise<SessionContext>;
}

export interface ChatableXTools {
  list(): Promise<ToolInfo[]>;
  execute(toolId: string, params: Record<string, unknown>): Promise<ToolResult>;
  executeWithConfirm(toolId: string, params: Record<string, unknown>): Promise<ToolResult>;
}

export interface ChatableXUI {
  showNotification(message: string, type?: NotificationType): Promise<void>;
  showConfirm(title: string, message: string): Promise<boolean>;
  pickFile(options?: FilePickerOptions): Promise<string | null>;
  openTab(config: TabConfig): Promise<void>;
  updateState(state: StateUpdate): Promise<void>;
}

export interface ChatableXEvents {
  on<T extends EventType>(eventType: T, callback: EventCallbackMap[T]): Unsubscribe;
  onAiResponse(callback: EventCallbackMap['aiResponse']): Unsubscribe;
  onToolExecution(callback: EventCallbackMap['toolExecution']): Unsubscribe;
  onUserMessage(callback: EventCallbackMap['userMessage']): Unsubscribe;
}

export interface ChatableXStorage {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ChatableXToolModule {
  getInfo(): ToolInfo;
  onExecute(handler: ToolExecuteHandler): void;
}

export interface ChatableXPlatform {
  /** Open URL in system browser with auth handoff (WebView only; implemented by Flutter host). */
  openInBrowser(targetUrl: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** Token payload returned by the host (never includes the refresh_token). */
export interface AuthTokenData {
  /** Bearer access token to put in the Authorization header. */
  access_token: string;
  /** Access token expiry, epoch milliseconds. */
  expires_at: number;
  /** Authenticated user id. */
  user_id: string;
}

/**
 * Unified auth entry point for all WebUI apps.
 *
 * In a hosted (Flutter WebView) environment this reuses the desktop login
 * session via the `host.getAuthToken` bridge call — apps never implement
 * login or token handling themselves.
 */
export interface ChatableXAuth {
  /**
   * Get a valid access token. Returns the in-memory cached token when still
   * valid, otherwise fetches a fresh one from the host. Returns `null` when
   * not authenticated / not hosted.
   */
  getToken(): Promise<AuthTokenData | null>;
  /**
   * Build auth headers ready to spread into a `fetch`. Returns
   * `{ Authorization: "Bearer <token>" }` when authenticated, otherwise `{}`.
   */
  getAuthHeaders(): Promise<Record<string, string>>;
  /** Currently authenticated user id, or `null`. Synchronous (cache only). */
  getUserId(): string | null;
  /** Whether a valid token is currently cached. Synchronous (cache only). */
  isAuthenticated(): boolean;
  /** Force a token refresh via the host. Resolves `true` on success. */
  refresh(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Cloud Storage
// ---------------------------------------------------------------------------

/** Binary payload accepted by `sdk.cloud.upload`. */
export type CloudUploadData = Blob | ArrayBuffer | ArrayBufferView | string;

export interface CloudUploadOptions {
  /**
   * MIME type to store the object as. Defaults to the `Blob.type` when a Blob
   * is given, otherwise `application/octet-stream`. Must be one allowed by the
   * server's content-type whitelist.
   */
  contentType?: string;
}

/** Result of a successful `sdk.cloud.upload`. */
export interface CloudUploadResult {
  /** App-relative key (the same `fileKey` passed to `upload`). */
  fileKey: string;
  /** Fully-qualified OSS object key (`user-data/{user_id}/{app_id}/{fileKey}`). */
  objectKey: string;
  /** Bytes uploaded. */
  size: number;
  /** MIME type the object was stored as. */
  contentType: string;
}

/** A single file in the user's cloud storage for this app. */
export interface CloudFileInfo {
  fileKey: string;
  size: number;
  /** ISO-8601 timestamp. */
  lastModified: string;
}

export interface CloudListOptions {
  /** Restrict the listing to keys under this app-relative prefix. */
  prefix?: string;
}

/** The user's storage usage / quota for the whole account. */
export interface CloudUsage {
  usedBytes: number;
  quotaBytes: number;
  fileCount: number;
  /** ISO-8601 timestamp of the last server-side reconciliation, if any. */
  reconciledAt?: string;
}

/**
 * Cloud storage for WebUI apps. Backed by auth-fc presigned OSS URLs; the
 * app's `appId` (from `ChatableX.init`) is injected automatically so every key
 * is namespaced to `{user}/{app}` and apps cannot reach into each other's data.
 *
 * Requires an authenticated session (`sdk.auth`) and a configured cloud API
 * base URL (see `ChatableXInitConfig.apiBaseUrl`).
 */
export interface ChatableXCloud {
  /** Upload (overwrite) a file. Resolves once the bytes are stored in OSS. */
  upload(fileKey: string, data: CloudUploadData, options?: CloudUploadOptions): Promise<CloudUploadResult>;
  /** Download a file's bytes as a Blob. */
  download(fileKey: string): Promise<Blob>;
  /** Get a short-lived presigned GET URL (e.g. to feed an `<img src>`). */
  getDownloadUrl(fileKey: string): Promise<string>;
  /** List the current app's files for this user. */
  list(options?: CloudListOptions): Promise<CloudFileInfo[]>;
  /** Delete a file. Resolves even if the object did not exist. */
  delete(fileKey: string): Promise<void>;
  /** Read the account's storage usage / quota. */
  usage(): Promise<CloudUsage>;
}

// ---------------------------------------------------------------------------
// Agent Lock
// ---------------------------------------------------------------------------

export interface AgentLockConfig {
  /** Enable the agent lock feature (default: true). */
  enabled?: boolean;
  /**
   * `"overlay"` — SDK renders a built-in transparent overlay (default).
   * `"events-only"` — SDK only emits lock/unlock events; no overlay injected.
   */
  mode?: 'overlay' | 'events-only';
  /** URL of the logo displayed in the overlay centre. Defaults to built-in Chatablex SVG. */
  logoUrl?: string;
  /** Message shown below the logo (default: "Agent 正在操作，请稍候…"). */
  message?: string;
  /** Show a cancel button on the overlay (default: true). */
  allowCancel?: boolean;
  /** Overlay background opacity, 0–1 (default: 0.3). */
  opacity?: number;
  /** Auto-unlock timeout in ms (default: 30000). 0 disables. */
  timeout?: number;
  /** Delay before actually removing the overlay after unlock, to avoid flicker between consecutive tools (default: 200ms). */
  debounceUnlock?: number;
}

export type AgentLockEventType = 'lock' | 'unlock' | 'cancel' | 'timeout';

export interface AgentLockEventData {
  requestId?: string;
  timestamp: number;
}

export type AgentLockEventHandler = (data: AgentLockEventData) => void;

export interface ChatableXAgentLock {
  /** Manually lock user interaction with an optional custom message / timeout. */
  lock(opts?: { message?: string; timeout?: number }): void;
  /** Manually unlock. Safe to call when already unlocked. */
  unlock(): void;
  /** Whether the overlay is currently active. */
  isLocked(): boolean;
  /** Subscribe to lock lifecycle events. Returns an unsubscribe function. */
  on(event: AgentLockEventType, handler: AgentLockEventHandler): () => void;
  /** Remove a previously registered handler. */
  off(event: AgentLockEventType, handler: AgentLockEventHandler): void;
}

export interface ChatableXSDK {
  ai: ChatableXAI;
  tools: ChatableXTools;
  ui: ChatableXUI;
  events: ChatableXEvents;
  storage: ChatableXStorage;
  tool: ChatableXToolModule;
  platform: ChatableXPlatform;
  auth: ChatableXAuth;
  cloud: ChatableXCloud;
  agentLock: ChatableXAgentLock;
}

// ---------------------------------------------------------------------------
// Global Window Augmentation
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    /** SDK instance — set after ChatableX.init() */
    ChatableX?: ChatableXSDK;
    /** Flutter → JS message receiver — set by SDK */
    ChatableXReceive?: (jsonStr: string) => void;
    /** Flutter's JavaScriptChannel (set by Flutter WebView) */
    ChatableXBridge?: { postMessage: (msg: string) => void };
    /** Direct dispatch function for Flutter's executeInWebUI */
    __CHATABLEX_DISPATCH__?: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  }
}
