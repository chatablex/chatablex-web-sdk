/**
 * ChatableX Web SDK — Type Definitions
 */
interface ChatOptions {
    sessionId?: string;
    context?: Record<string, unknown>;
    tools?: string[];
    skills?: string[];
    stream?: boolean;
}
interface ChatResponse {
    content: string;
    sessionId: string;
    messageId: string;
    toolResults?: ToolResult[];
    finished: boolean;
    model?: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}
interface SessionContext {
    sessionId: string;
    name: string;
    messages: Message[];
    activeTools: string[];
    activeSkills: string[];
    createdAt: string;
    updatedAt: string;
}
interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: string;
    toolCalls?: ToolCall[];
}
interface ToolInfo {
    id: string;
    name: string;
    version: string;
    description: string;
}
interface ToolParameter {
    name: string;
    type: string;
    description: string;
    required: boolean;
    default?: unknown;
    enum?: string[];
}
interface ToolCall {
    id: string;
    toolId: string;
    name: string;
    params: Record<string, unknown>;
    status: 'pending' | 'running' | 'success' | 'error' | 'cancelled';
}
interface ToolResult {
    success: boolean;
    data?: unknown;
    error?: string;
    toolId: string;
    duration?: number;
}
type ToolExecuteHandler = (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
interface Skill {
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
interface SkillVariable {
    name: string;
    type: string;
    description: string;
    required: boolean;
    default?: unknown;
}
interface SkillResult {
    success: boolean;
    data?: unknown;
    error?: string;
    skillId: string;
    toolResults?: ToolResult[];
}
type NotificationType = 'info' | 'success' | 'warning' | 'error';
interface FilePickerOptions {
    type?: 'any' | 'image' | 'video' | 'audio' | 'custom';
    multiple?: boolean;
    allowedExtensions?: string[];
}
interface TabConfig {
    id: string;
    title: string;
    icon?: string;
    type: 'chat' | 'tool' | 'skill' | 'custom';
    data?: Record<string, unknown>;
}
interface StateUpdate {
    refreshMessages?: boolean;
    closeWebUI?: boolean;
    [key: string]: unknown;
}
type EventType = 'aiResponse' | 'toolExecution' | 'userMessage' | 'streamingContent' | 'close';
interface AiResponseEventData extends ChatResponse {
}
interface ToolExecutionEventData {
    toolCall: ToolCall;
    result?: ToolResult;
}
interface UserMessageEventData {
    message: string;
    timestamp: string;
}
interface StreamingContentEventData {
    content: string;
    finished?: boolean;
}
interface CloseEventData {
    toolId: string;
}
interface EventCallbackMap {
    aiResponse: (data: AiResponseEventData) => void;
    toolExecution: (data: ToolExecutionEventData) => void;
    userMessage: (data: UserMessageEventData) => void;
    streamingContent: (data: StreamingContentEventData) => void;
    close: (data: CloseEventData) => void;
}
type Unsubscribe = () => void;
interface ChatableXInitConfig {
    /** Your app / tool id (must match manifest.json id) */
    appId: string;
    /** SDK version override (default: SDK built-in version) */
    version?: string;
    /** Enable debug logging (default: false) */
    debug?: boolean;
    /** Timeout in ms for the handshake with Flutter (default: 10000) */
    timeout?: number;
}
interface ChatableXAI {
    chat(message: string, options?: ChatOptions): Promise<ChatResponse>;
    chatStream(message: string, options?: ChatOptions): Promise<unknown>;
    getContext(): Promise<SessionContext>;
}
interface ChatableXTools {
    list(): Promise<ToolInfo[]>;
    execute(toolId: string, params: Record<string, unknown>): Promise<ToolResult>;
    executeWithConfirm(toolId: string, params: Record<string, unknown>): Promise<ToolResult>;
}
interface ChatableXSkills {
    list(): Promise<Skill[]>;
    execute(skillId: string, variables: Record<string, unknown>): Promise<SkillResult>;
}
interface ChatableXUI {
    showNotification(message: string, type?: NotificationType): Promise<void>;
    showConfirm(title: string, message: string): Promise<boolean>;
    pickFile(options?: FilePickerOptions): Promise<string | null>;
    openTab(config: TabConfig): Promise<void>;
    updateState(state: StateUpdate): Promise<void>;
}
interface ChatableXEvents {
    on<T extends EventType>(eventType: T, callback: EventCallbackMap[T]): Unsubscribe;
    onAiResponse(callback: EventCallbackMap['aiResponse']): Unsubscribe;
    onToolExecution(callback: EventCallbackMap['toolExecution']): Unsubscribe;
    onUserMessage(callback: EventCallbackMap['userMessage']): Unsubscribe;
}
interface ChatableXStorage {
    get<T = unknown>(key: string): Promise<T | null>;
    set<T = unknown>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
}
interface ChatableXToolModule {
    getInfo(): ToolInfo;
    onExecute(handler: ToolExecuteHandler): void;
}
interface ChatableXSDK {
    ai: ChatableXAI;
    tools: ChatableXTools;
    skills: ChatableXSkills;
    ui: ChatableXUI;
    events: ChatableXEvents;
    storage: ChatableXStorage;
    tool: ChatableXToolModule;
}
declare global {
    interface Window {
        /** SDK instance — set after ChatableX.init() */
        ChatableX?: ChatableXSDK;
        /** Flutter → JS message receiver — set by SDK */
        ChatableXReceive?: (jsonStr: string) => void;
        /** Flutter's JavaScriptChannel (set by Flutter WebView) */
        ChatableXBridge?: {
            postMessage: (msg: string) => void;
        };
        /** Direct dispatch function for Flutter's executeInWebUI */
        __CHATABLEX_DISPATCH__?: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
    }
}

/**
 * Low-level WebView bridge between the Web SDK and the Flutter host.
 *
 * Communication:
 *   JS → Flutter : window.ChatableXBridge.postMessage(JSON.stringify(msg))
 *   Flutter → JS : controller.runJavaScript("window.ChatableXReceive('...')")
 */
type EventHandler = (data: unknown) => void;
declare class Bridge {
    private _msgId;
    private _pending;
    private _listeners;
    private _debug;
    constructor(debug?: boolean);
    /** Install the global ChatableXReceive handler so Flutter can push data in. */
    install(): void;
    /** Wait for ChatableXBridge (set by Flutter) to become available. */
    waitForBridge(timeoutMs: number): Promise<void>;
    /** Send a request to Flutter and wait for a response. */
    sendMessage(method: string, params?: Record<string, unknown>, requestTimeoutMs?: number): Promise<unknown>;
    private _handleResponse;
    private _handleEvent;
    addEventListener(eventType: string, handler: EventHandler): () => void;
    /** Dispatch a synthetic event (used internally). */
    dispatchEvent(eventType: string, data: unknown): void;
    private _nextId;
    private _log;
    destroy(): void;
}

/**
 * chatablex-web-sdk
 *
 * Runtime SDK for ChatableX AI App (WebUI) development.
 * Developers install this package and call `ChatableX.init()` to connect
 * their web app to the ChatableX Flutter host.
 *
 * @example
 * ```ts
 * import { ChatableX } from 'chatablex-web-sdk';
 *
 * const sdk = await ChatableX.init({ appId: 'counter-app' });
 *
 * sdk.tool.onExecute(async (params) => {
 *   // handle LLM-driven tool calls
 *   return { success: true, data: 'done' };
 * });
 * ```
 */

declare const SDK_VERSION = "1.0.0";
/**
 * Main entry point. Provides `ChatableX.init()` to bootstrap the SDK.
 */
declare const ChatableX: {
    /**
     * Initialize the SDK and establish the bridge with the Flutter host.
     *
     * 1. Sets up `window.ChatableXReceive` (Flutter → JS message handler).
     * 2. Waits for `window.ChatableXBridge` (Flutter's JavaScriptChannel).
     * 3. Sends `sdk_init` handshake and receives tool config from Flutter.
     * 4. Returns the fully-initialised SDK instance.
     */
    init(config: ChatableXInitConfig): Promise<ChatableXSDK>;
    /** Get the current SDK instance (throws if not initialised). */
    getInstance(): ChatableXSDK;
    /** Check whether the SDK has been initialised. */
    isReady(): boolean;
    /** SDK version */
    version: string;
};

export { type AiResponseEventData, Bridge, type ChatOptions, type ChatResponse, ChatableX, type ChatableXAI, type ChatableXEvents, type ChatableXInitConfig, type ChatableXSDK, type ChatableXSkills, type ChatableXStorage, type ChatableXToolModule, type ChatableXTools, type ChatableXUI, type CloseEventData, type EventCallbackMap, type EventType, type FilePickerOptions, type Message, type NotificationType, SDK_VERSION, type SessionContext, type Skill, type SkillResult, type SkillVariable, type StateUpdate, type StreamingContentEventData, type TabConfig, type ToolCall, type ToolExecuteHandler, type ToolExecutionEventData, type ToolInfo, type ToolParameter, type ToolResult, type Unsubscribe, type UserMessageEventData };
