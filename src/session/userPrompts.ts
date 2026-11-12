import { mapChoiceReply } from '../providers/claude-code/assistantContent';
import type { PromptQuestion, UserPrompt, UserPromptReply } from '../providers/types';

// CLI 停下等人时，微信上怎么列、微信回复怎么译成决定。纯函数，无 IO。
//
// 电脑端无人值守，这里是唯一的作答入口：任何回复都要能落成一个决定，
// 不能出现「请到电脑上处理」。提问一题一题来（用户每回一条，微信配额就刷新），
// 回序号译成选项原文，其余说法原样作为这道题的回答。

const ALLOW = new Set(['1', 'a', '允许', '允許', '同意', '可以', '好', '好的', '行', '执行', 'yes', 'y', 'ok', 'allow']);
const DENY = new Set(['2', 'b', '拒绝', '拒絕', '不', '不行', '不要', '不执行', 'no', 'n', 'deny']);

const DENIED = '用户在微信上拒绝了这次调用。';
const DENIED_AND_SAID = '用户在微信上拒绝了这次调用，并说：';
const PLAN_DENIED = '用户暂不执行这个计划。';
const PLAN_OPTIONS = '（回复 1 执行，之后照常自动放行；回复 2 执行，但这次执行期间改文件、跑命令前逐个找你确认；回复「不执行」不执行；直接说要改什么，就作为修改意见转过去）';
/** 像选项编号或字母的回复（如「3」「c」）：对不上计划的选项，按不执行处理，不当作修改意见。 */
const OPTION_LIKE = /^(?:\d{1,2}|[a-z])$/;

/** 第 [index] 道题（从 0 起）在微信上的样子。 */
export function renderQuestion(questions: PromptQuestion[], index: number): string {
  const question = questions[index]!;
  const progress = questions.length > 1 ? `（第 ${index + 1}/${questions.length} 题）` : '';
  const lines = [`❓ ${question.question.trim()}${progress}`];
  question.options.forEach((option, i) => {
    const description = option.description?.trim();
    lines.push(description ? `${i + 1}. ${option.label.trim()} —— ${description}` : `${i + 1}. ${option.label.trim()}`);
  });
  if (question.options.length === 0) {
    lines.push('（直接回复你的答案）');
  } else if (question.multiSelect) {
    lines.push('（可多选，回复序号，多个用逗号分隔，如 1,3；也可以直接说你的要求）');
  } else {
    lines.push('（回复序号，如 1；也可以直接说你的要求）');
  }
  return lines.join('\n');
}

/** 计划确认、权限确认在微信上的样子；提问用 [renderQuestion]。 */
export function renderPrompt(prompt: UserPrompt): string {
  switch (prompt.kind) {
    case 'question':
      return renderQuestion(prompt.questions, 0);
    case 'plan':
      return `📋 计划待确认\n\n${prompt.plan.trim()}\n\n${PLAN_OPTIONS}`;
    case 'permission': {
      const detail = prompt.detail.trim();
      return `🔐 请求权限：${prompt.toolName}${detail ? `\n${detail}` : ''}\n\n（回复 1 或「允许」放行；回复 2 或「拒绝」拒绝；回复其他内容则拒绝，并把你的话转告给它）`;
    }
  }
}

/** 这道题的答案：序号对得上选项给选项原文（多选以 ", " 连接），否则原话。 */
export function answerQuestion(question: PromptQuestion, reply: string): string {
  const labels = question.options.map((option) => option.label.trim());
  return mapChoiceReply(reply, labels, question.multiSelect) ?? reply.trim();
}

/** 确认里要批准的那一步，用于提示里写明是哪一件：取第一行，超过 40 字截短。 */
export function promptStep(prompt: UserPrompt): string {
  const line = stepLine(prompt);
  return line.length > 40 ? `${line.slice(0, 40)}…` : line;
}

// 提问取第一道题；计划取第一行并去掉 Markdown 标题的 #；权限取命令或路径，
// 只有参数原文（JSON）可用时用工具名，不把一串 JSON 塞进提示
function stepLine(prompt: UserPrompt): string {
  if (prompt.kind === 'question') return prompt.questions[0]?.question.trim() ?? '';
  if (prompt.kind === 'plan') return firstLine(prompt.plan).replace(/^#+\s*/, '');
  const detail = firstLine(prompt.detail);
  return !detail || detail.startsWith('{') || detail.startsWith('[') ? prompt.toolName : detail;
}

function firstLine(text: string): string {
  return text.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
}

/**
 * 计划或权限确认的回复译成决定。asFeedback：这句话不是选项，被当成了「拒绝并转告」或计划的修改意见——
 * 用户自己看不出来，要告诉他；是选项就不复述用户自己刚做的选择。
 * 返回 null：计划确认里含糊的同意（「好」「可以」），判不出选 1 还是 2，要再问一次。
 */
export function decideConfirmation(kind: 'plan' | 'permission', reply: string): { reply: UserPromptReply; asFeedback: boolean } | null {
  const word = normalizeReply(reply);
  if (kind === 'plan') {
    // 与原生计划确认框一致：1 执行并照常自动放行；2 执行，但这次执行期间改动逐个确认
    if (word === '1' || word === 'a') return { reply: { kind: 'approve', permissionMode: 'bypassPermissions' }, asFeedback: false };
    if (word === '2' || word === 'b') return { reply: { kind: 'approve', permissionMode: 'default' }, asFeedback: false };
    // 不映射到 1：那会替用户选「全部自动放行」，权限放宽不能由随口一句触发
    if (ALLOW.has(word)) return null;
    if (DENY.has(word) || OPTION_LIKE.test(word)) return { reply: { kind: 'deny', message: PLAN_DENIED }, asFeedback: false };
    return { reply: { kind: 'deny', message: reply.trim() }, asFeedback: true };
  }
  if (ALLOW.has(word)) return { reply: { kind: 'approve' }, asFeedback: false };
  if (DENY.has(word)) return { reply: { kind: 'deny', message: DENIED }, asFeedback: false };
  return { reply: { kind: 'deny', message: DENIED_AND_SAID + reply.trim() }, asFeedback: true };
}

/** 计划确认里回了含糊的同意时再问一次。 */
export const PLAN_CHOOSE = '请回「1」或「2」选择怎么执行，回「不执行」不执行，或直接说要改什么。';

/** 全角数字转半角、去掉结尾标点、转小写：「１。」与「1」同义。 */
function normalizeReply(reply: string): string {
  return reply
    .trim()
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFF10 + 0x30))
    .replace(/[.。!！、,，)）:：~～]+$/, '')
    .toLowerCase();
}
