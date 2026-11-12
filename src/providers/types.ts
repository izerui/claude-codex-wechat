export type ProviderId = 'claude-code' | 'codex';

export type ProviderSessionStatus = 'starting' | 'idle' | 'running' | 'waiting_permission' | 'errored' | 'closed';

export type ProviderSession = {
  bridgeSessionId: string;
  providerId: ProviderId;
  providerSessionId?: string;
  cwd: string;
  status: ProviderSessionStatus;
};

export type PromptQuestion = {
  /** 回答时按它对上题目：Claude 用题目原文，Codex 用题目 id。 */
  id: string;
  question: string;
  multiSelect: boolean;
  options: Array<{ label: string; description?: string }>;
};

/** CLI 停下来等人决定的事。电脑端无人值守，只能由微信用户作答。 */
export type UserPrompt =
  | { kind: 'question'; questions: PromptQuestion[] }
  | { kind: 'plan'; plan: string }
  | { kind: 'permission'; toolName: string; detail: string };

export type UserPromptReply =
  | { kind: 'answers'; answers: Record<string, string> }
  // 批准计划时选的执行方式：bypassPermissions 照常自动放行；default 这次执行期间改动逐个找用户确认
  | { kind: 'approve'; permissionMode?: 'bypassPermissions' | 'default' }
  | { kind: 'deny'; message: string };

export type ProviderEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'message_done'; text?: string }
  // 调用了工具：之前的助手文字只是过程说明，不是这一轮的结论。
  | { type: 'tool_event'; title: string; summary?: string }
  // 一轮结束：此前攒下的结论可以发给用户了。
  | { type: 'turn_end' }
  // Native background work is session-scoped and survives turn boundaries.
  | { type: 'background_tasks'; tasks: Array<{ id: string; description?: string }> }
  // CLI 停下等人作答；respond 只应调用一次，之后 CLI 继续这一轮。
  // id 用于随后的撤回：CLI 不再等这个回答时发 user_prompt_withdrawn。
  | { type: 'user_prompt'; id?: string; prompt: UserPrompt; respond(reply: UserPromptReply): void }
  // CLI 撤回了还没作答的请求（例如它自己取消了）：桥接不再等它，已推到手机的要告诉用户已失效。
  | { type: 'user_prompt_withdrawn'; id: string }
  | { type: 'session_state'; state: ProviderSession }
  | { type: 'error'; error: string; code?: string };

export type ProviderSessionCandidate = {
  id: string;
  providerId: ProviderId;
  cwd?: string;
  title?: string;
  resumeTitle?: string;
  lastActivityAt?: number;
  bridgeBindingSource?: 'sidecar' | 'bridge_tag';
  bridgeTag?: {
    platform: 'weixin';
    platformUserId: string;
    chatId: string;
  };
};

export type NativeVersionStamp = {
  fingerprint: string;
  observedAt: number;
};

export interface NativeProviderAdapter {
  id: ProviderId;
  startSession(input: {
    bridgeSessionId: string;
    cwd: string;
    initialPrompt?: string;
    options?: Record<string, unknown> & {
      providerSessionId?: string;
      sessionName?: string;
    };
  }): Promise<ProviderSession>;
  sendMessage(input: {
    bridgeSessionId: string;
    text: string;
    attachments?: Array<{ localPath: string; mimeType?: string }>;
  }): AsyncIterable<ProviderEvent>;
  stopSession(bridgeSessionId: string): Promise<void>;
  getNativeVersion?(input: {
    providerSessionId: string;
    cwd: string;
  }): Promise<NativeVersionStamp | null>;
  listRecoverableSessions?(): Promise<ProviderSessionCandidate[]>;
  attachSession?(input: {
    candidateId: string;
    bridgeSessionId: string;
    cwd: string;
  }): Promise<ProviderSession>;
  interruptSession?(bridgeSessionId: string): Promise<void>;
  // Inject a message into the in-flight turn (native "steer") instead of
  // starting a new turn. Only providers running a persistent session support it.
  steerSession?(bridgeSessionId: string, text: string): Promise<boolean | void>;
}
