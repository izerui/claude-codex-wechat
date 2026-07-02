// Shared decoding of a Claude `assistant` message's content blocks into the
// plain-text chunks the bridge forwards to WeChat.
//
// Besides `text` blocks, we also render the `AskUserQuestion` tool call. In
// headless/print mode (`-p --dangerously-skip-permissions`) that tool is
// auto-denied and never blocks, but its `input` carries the actual choices the
// model wants the human to pick. If we drop it (as a bare tool_use block),
// WeChat only receives Claude's follow-up "pick one of the options above" text
// while the options themselves are missing — confusing and unusable. Rendering
// the question + options as text lets the WeChat user answer in plain words on
// the next turn, matching native CLI semantics.

export function extractAssistantText(message: unknown): string[] {
  if (!message || typeof message !== 'object') return [];
  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (record.type === 'text' && typeof record.text === 'string') return [record.text];
    if (record.type === 'tool_use' && record.name === 'AskUserQuestion') {
      const rendered = renderAskUserQuestion(record.input);
      return rendered ? [rendered] : [];
    }
    return [];
  });
}

type AskQuestion = {
  question?: unknown;
  header?: unknown;
  multiSelect?: unknown;
  options?: unknown;
};

type AskOption = {
  label?: unknown;
  description?: unknown;
};

export function renderAskUserQuestion(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const questions = (input as Record<string, unknown>).questions;
  if (!Array.isArray(questions) || questions.length === 0) return null;

  const blocks: string[] = [];
  for (const raw of questions) {
    if (!raw || typeof raw !== 'object') continue;
    const q = raw as AskQuestion;
    const question = typeof q.question === 'string' ? q.question.trim() : '';
    if (!question) continue;

    const lines = [`❓ ${question}`];
    const options = Array.isArray(q.options) ? q.options : [];
    options.forEach((rawOption, index) => {
      if (!rawOption || typeof rawOption !== 'object') return;
      const option = rawOption as AskOption;
      const label = typeof option.label === 'string' ? option.label.trim() : '';
      if (!label) return;
      const description = typeof option.description === 'string' ? option.description.trim() : '';
      lines.push(description ? `${index + 1}. ${label} —— ${description}` : `${index + 1}. ${label}`);
    });

    if (q.multiSelect === true) lines.push('（可多选，回复你选择的选项文字即可）');
    else lines.push('（直接回复你选择的选项文字即可）');
    blocks.push(lines.join('\n'));
  }

  return blocks.length > 0 ? blocks.join('\n\n') : null;
}
