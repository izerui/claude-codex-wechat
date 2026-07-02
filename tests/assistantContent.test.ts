import { describe, expect, it } from 'vitest';
import { extractAssistantBlocks, mapChoiceReply, renderAskUserQuestion } from '../src/providers/claude-code/assistantContent';

describe('renderAskUserQuestion', () => {
  it('renders a single question with numbered options and a mapping', () => {
    const rendered = renderAskUserQuestion({
      questions: [
        {
          question: '晚饭吃什么？',
          multiSelect: false,
          options: [
            { label: '米饭', description: '吃米饭' },
            { label: '面条', description: '吃面条' },
          ],
        },
      ],
    });
    expect(rendered).not.toBeNull();
    expect(rendered!.labels).toEqual(['米饭', '面条']);
    expect(rendered!.multiSelect).toBe(false);
    expect(rendered!.text).toContain('❓ 晚饭吃什么？');
    expect(rendered!.text).toContain('1. 米饭 —— 吃米饭');
    expect(rendered!.text).toContain('回复序号或选项文字');
  });

  it('disables numeric mapping when there are multiple questions', () => {
    const rendered = renderAskUserQuestion({
      questions: [
        { question: 'A?', options: [{ label: 'a1' }] },
        { question: 'B?', options: [{ label: 'b1' }] },
      ],
    });
    expect(rendered).not.toBeNull();
    expect(rendered!.labels).toEqual([]);
    expect(rendered!.text).toContain('❓ A?');
    expect(rendered!.text).toContain('❓ B?');
  });

  it('returns null for malformed input', () => {
    expect(renderAskUserQuestion(null)).toBeNull();
    expect(renderAskUserQuestion({})).toBeNull();
    expect(renderAskUserQuestion({ questions: [] })).toBeNull();
  });
});

describe('extractAssistantBlocks', () => {
  it('extracts text and AskUserQuestion choice blocks, skipping other tools', () => {
    const blocks = extractAssistantBlocks({
      content: [
        { type: 'text', text: '好的' },
        { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
        { type: 'tool_use', name: 'AskUserQuestion', input: { questions: [{ question: '选?', multiSelect: true, options: [{ label: 'x' }] }] } },
      ],
    });
    expect(blocks).toEqual([
      { type: 'text', text: '好的' },
      { type: 'choice', text: expect.stringContaining('❓ 选?'), labels: ['x'], multiSelect: true },
    ]);
  });
});

describe('mapChoiceReply', () => {
  const labels = ['米饭', '面条', '饺子'];

  it('maps a single number to its label', () => {
    expect(mapChoiceReply('1', labels, false)).toBe('米饭');
    expect(mapChoiceReply(' 2 ', labels, false)).toBe('面条');
  });

  it('maps multiple numbers only when multiSelect', () => {
    expect(mapChoiceReply('1,3', labels, true)).toBe('米饭, 饺子');
    expect(mapChoiceReply('1、2', labels, true)).toBe('米饭, 面条');
    expect(mapChoiceReply('1,3', labels, false)).toBeNull();
  });

  it('dedupes repeated indices preserving order', () => {
    expect(mapChoiceReply('3 1 3', labels, true)).toBe('饺子, 米饭');
  });

  it('returns null for non-numeric or out-of-range replies', () => {
    expect(mapChoiceReply('米饭', labels, false)).toBeNull();
    expect(mapChoiceReply('', labels, false)).toBeNull();
    expect(mapChoiceReply('0', labels, false)).toBeNull();
    expect(mapChoiceReply('4', labels, false)).toBeNull();
    expect(mapChoiceReply('1 apple', labels, true)).toBeNull();
  });

  it('returns null when there are no labels to map to', () => {
    expect(mapChoiceReply('1', [], false)).toBeNull();
  });
});
