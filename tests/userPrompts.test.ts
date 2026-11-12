import { describe, expect, it } from 'vitest';
import { answerQuestion, decideConfirmation, promptStep, renderPrompt } from '../src/session/userPrompts';

describe('userPrompts', () => {
  it('权限确认：允许词放行，拒绝词拒绝，其他话拒绝并转告原话（只有这种要说明）', () => {
    expect(decideConfirmation('permission', '允许')).toEqual({ reply: { kind: 'approve' }, asFeedback: false });
    expect(decideConfirmation('permission', '１。')).toEqual({ reply: { kind: 'approve' }, asFeedback: false });
    expect(decideConfirmation('permission', 'OK')).toEqual({ reply: { kind: 'approve' }, asFeedback: false });
    expect(decideConfirmation('permission', '2')).toEqual({ reply: { kind: 'deny', message: '用户在微信上拒绝了这次调用。' }, asFeedback: false });
    expect(decideConfirmation('permission', '不行')).toEqual({ reply: { kind: 'deny', message: '用户在微信上拒绝了这次调用。' }, asFeedback: false });
    expect(decideConfirmation('permission', '换个目录再删')).toEqual({ reply: { kind: 'deny', message: '用户在微信上拒绝了这次调用，并说：换个目录再删' }, asFeedback: true });
  });

  it('计划确认与原生确认框一致：1 执行并自动放行，2 执行但逐个确认，不执行与对不上的编号不执行，含糊的同意再问，其他话作为修改意见', () => {
    expect(decideConfirmation('plan', '1')).toEqual({ reply: { kind: 'approve', permissionMode: 'bypassPermissions' }, asFeedback: false });
    expect(decideConfirmation('plan', 'A')).toEqual({ reply: { kind: 'approve', permissionMode: 'bypassPermissions' }, asFeedback: false });
    expect(decideConfirmation('plan', '2')).toEqual({ reply: { kind: 'approve', permissionMode: 'default' }, asFeedback: false });
    expect(decideConfirmation('plan', 'b')).toEqual({ reply: { kind: 'approve', permissionMode: 'default' }, asFeedback: false });
    expect(decideConfirmation('plan', '不执行')).toEqual({ reply: { kind: 'deny', message: '用户暂不执行这个计划。' }, asFeedback: false });
    expect(decideConfirmation('plan', '3')).toEqual({ reply: { kind: 'deny', message: '用户暂不执行这个计划。' }, asFeedback: false });
    expect(decideConfirmation('plan', '好的')).toBeNull();
    expect(decideConfirmation('plan', 'ok')).toBeNull();
    expect(decideConfirmation('plan', '第二步先不做')).toEqual({ reply: { kind: 'deny', message: '第二步先不做' }, asFeedback: true });
  });

  it('提问：序号译成选项原文，越界或混着别的字时原话作答', () => {
    const question = { id: 'q', question: '?', multiSelect: false, options: [{ label: '甲' }, { label: '乙' }] };
    expect(answerQuestion(question, '2')).toBe('乙');
    expect(answerQuestion(question, '3')).toBe('3');
    expect(answerQuestion(question, '都不要')).toBe('都不要');
  });

  it('提示里「哪一步」的取法：提问取第一道题，计划去掉标题的 #，权限取命令，只有参数 JSON 时取工具名，过长截短', () => {
    expect(promptStep({ kind: 'question', questions: [
      { id: 'q1', question: '用哪个数据库？', multiSelect: false, options: [] },
      { id: 'q2', question: '要不要缓存？', multiSelect: false, options: [] },
    ] })).toBe('用哪个数据库？');
    expect(promptStep({ kind: 'plan', plan: '\n# 计划：创建 b.txt\n\n## 步骤' })).toBe('计划：创建 b.txt');
    expect(promptStep({ kind: 'permission', toolName: 'Bash', detail: 'rm -f /tmp/out/*.png\n第二行' })).toBe('rm -f /tmp/out/*.png');
    expect(promptStep({ kind: 'permission', toolName: 'mcp__db__query', detail: '{"sql":"select 1"}' })).toBe('mcp__db__query');
    expect(promptStep({ kind: 'permission', toolName: 'Grep', detail: '' })).toBe('Grep');
    expect(promptStep({ kind: 'permission', toolName: 'Bash', detail: 'x'.repeat(50) })).toBe(`${'x'.repeat(40)}…`);
  });

  it('权限确认列出工具名和要批准的内容', () => {
    expect(renderPrompt({ kind: 'permission', toolName: 'Bash', detail: 'rm -rf build' })).toContain('🔐 请求权限：Bash\nrm -rf build');
  });
});
