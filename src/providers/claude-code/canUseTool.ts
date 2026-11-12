import type { PromptQuestion, UserPrompt, UserPromptReply } from '../types';

// Claude 以 `--permission-prompt-tool stdio` 启动后，凡是要停下等人的调用都会经
// stdout 发来 control_request（subtype: can_use_tool），并等 stdin 上同一 request_id 的
// control_response。即使跳过权限（--dangerously-skip-permissions），AskUserQuestion 与
// ExitPlanMode 仍会走这里（requires_user_interaction: true）；普通工具则直接放行、不会来问。

export type CanUseToolRequest = {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
};

/** 认出 can_use_tool 请求；不是则返回 null。 */
export function readCanUseTool(record: Record<string, unknown>): CanUseToolRequest | null {
  if (record.type !== 'control_request' || typeof record.request_id !== 'string') return null;
  const request = record.request;
  if (!request || typeof request !== 'object') return null;
  const body = request as Record<string, unknown>;
  if (body.subtype !== 'can_use_tool' || typeof body.tool_name !== 'string') return null;
  const input = body.input && typeof body.input === 'object' ? body.input as Record<string, unknown> : {};
  return { requestId: record.request_id, toolName: body.tool_name, input };
}

export function promptFor(request: CanUseToolRequest): UserPrompt {
  if (request.toolName === 'AskUserQuestion') {
    const questions = readQuestions(request.input);
    if (questions.length > 0) return { kind: 'question', questions };
  }
  if (request.toolName === 'ExitPlanMode') {
    const plan = typeof request.input.plan === 'string' ? request.input.plan : '';
    return { kind: 'plan', plan };
  }
  return { kind: 'permission', toolName: request.toolName, detail: describeInput(request.input) };
}

/** 微信上的决定写成 stdin 上的 control_response 一行。 */
export function controlResponse(request: CanUseToolRequest, reply: UserPromptReply): string {
  const decision = reply.kind === 'deny'
    ? { behavior: 'deny', message: reply.message }
    : {
        behavior: 'allow',
        // AskUserQuestion 的答案按题目原文作键，随调用参数一起交回（与原生 TUI 作答后的形状一致）
        updatedInput: reply.kind === 'answers' ? { ...request.input, answers: reply.answers } : request.input,
        // 批准计划时选的执行方式，与原生计划确认框的前两项一致
        ...(reply.kind === 'approve' && reply.permissionMode
          ? { updatedPermissions: [{ type: 'setMode', mode: reply.permissionMode, destination: 'session' }] }
          : {}),
      };
  return `${JSON.stringify({
    type: 'control_response',
    response: { subtype: 'success', request_id: request.requestId, response: decision },
  })}\n`;
}

function readQuestions(input: Record<string, unknown>): PromptQuestion[] {
  if (!Array.isArray(input.questions)) return [];
  return input.questions.flatMap((raw): PromptQuestion[] => {
    if (!raw || typeof raw !== 'object') return [];
    const record = raw as Record<string, unknown>;
    if (typeof record.question !== 'string' || !record.question.trim()) return [];
    const options = Array.isArray(record.options) ? record.options : [];
    return [{
      id: record.question,
      question: record.question,
      multiSelect: record.multiSelect === true,
      options: options.flatMap((option) => {
        if (!option || typeof option !== 'object') return [];
        const { label, description } = option as Record<string, unknown>;
        if (typeof label !== 'string' || !label.trim()) return [];
        return [{ label, ...(typeof description === 'string' && description.trim() ? { description } : {}) }];
      }),
    }];
  });
}

/** 要批准的内容：命令、路径这类关键字段优先，其余原样列出。 */
function describeInput(input: Record<string, unknown>): string {
  for (const key of ['command', 'file_path', 'path', 'url']) {
    if (typeof input[key] === 'string' && input[key]) return input[key] as string;
  }
  const json = JSON.stringify(input);
  return json === '{}' ? '' : json.length > 800 ? `${json.slice(0, 800)}…` : json;
}
