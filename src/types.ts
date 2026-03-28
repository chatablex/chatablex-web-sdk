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
// Skill
// ---------------------------------------------------------------------------

export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  category?: string;
  toolIds: string[];
  variables: SkillVariable[];
  installed: boolean;
}

export interface SkillVariable {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: unknown;
}

export interface SkillResult {
  success: boolean;
  data?: unknown;
  error?: string;
  skillId: string;
  toolResults?: ToolResult[];
}

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

export interface ChatableXSkills {
  list(): Promise<Skill[]>;
  execute(skillId: string, variables: Record<string, unknown>): Promise<SkillResult>;
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

export interface ChatableXSDK {
  ai: ChatableXAI;
  tools: ChatableXTools;
  skills: ChatableXSkills;
  ui: ChatableXUI;
  events: ChatableXEvents;
  storage: ChatableXStorage;
  tool: ChatableXToolModule;
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
