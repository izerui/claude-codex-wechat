export type ProviderId = 'claude-code' | 'codex';

export type ProviderSessionStatus = 'starting' | 'idle' | 'running' | 'waiting_permission' | 'errored' | 'closed';

export type ProviderSession = {
  bridgeSessionId: string;
  providerId: ProviderId;
  providerSessionId?: string;
  cwd: string;
  status: ProviderSessionStatus;
};

export type PermissionChoice = 'approve' | 'approve_for_session' | 'deny' | 'abort';

export type PermissionRequest = {
  id: string;
  bridgeSessionId: string;
  providerId: ProviderId;
  toolName: string;
  summary: string;
  details?: unknown;
  choices: PermissionChoice[];
  expiresAt?: number;
};

export type ProviderEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'message_done'; text?: string }
  | { type: 'permission_request'; request: PermissionRequest }
  | { type: 'tool_event'; title: string; summary?: string }
  | { type: 'session_state'; state: ProviderSession }
  | { type: 'error'; error: string };

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
  decidePermission?(input: {
    requestId: string;
    decision: Exclude<PermissionChoice, 'approve_for_session'>;
  }): Promise<void>;
  listRecoverableSessions?(): Promise<ProviderSessionCandidate[]>;
  attachSession?(input: {
    candidateId: string;
    bridgeSessionId: string;
    cwd: string;
  }): Promise<ProviderSession>;
  archiveSession?(providerSessionId: string): Promise<void>;
  interruptSession?(bridgeSessionId: string): Promise<void>;
  // Inject a message into the in-flight turn (native "steer") instead of
  // starting a new turn. Only providers running a persistent session support it.
  steerSession?(bridgeSessionId: string, text: string): Promise<void>;
}
