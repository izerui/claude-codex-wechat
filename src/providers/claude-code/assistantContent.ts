// Shared decoding of a Claude `assistant` message's content blocks into what the
// bridge forwards to WeChat.
//
// Besides `text` blocks, we also render the `AskUserQuestion` tool call. In
// headless/print mode (`-p --dangerously-skip-permissions`) that tool is
// auto-denied and never blocks, but its `input` carries the actual choices the
// model wants the human to pick. If we drop it (as a bare tool_use block),
// WeChat only receives Claude's follow-up "pick one of the options above" text
// while the options themselves are missing — confusing and unusable. Rendering
// the question + options as text lets the WeChat user answer on the next turn.
//
// The rendered options are numbered (`1.`, `2.`, …). A single-question prompt
// also yields an ordered `labels` list so the caller can translate a bare
// numeric reply ("1") back into the option's label ("米饭") — matching the
// native TUI where the choice box is numbered and answerable by number.

export type AssistantBlock =
  | { type: 'text'; text: string }
  | { type: 'choice'; text: string; labels: string[]; multiSelect: boolean };

export function extractAssistantBlocks(message: unknown): AssistantBlock[] {
  if (!message || typeof message !== 'object') return [];
  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((item): AssistantBlock[] => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (record.type === 'text' && typeof record.text === 'string') {
      return [{ type: 'text', text: record.text }];
    }
    if (record.type === 'tool_use' && record.name === 'AskUserQuestion') {
      const rendered = renderAskUserQuestion(record.input);
      return rendered ? [{ type: 'choice', ...rendered }] : [];
    }
    return [];
  });
}

// Kept for callers that only need the plain-text projection.
export function extractAssistantText(message: unknown): string[] {
  return extractAssistantBlocks(message).map((block) => block.text);
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

export function renderAskUserQuestion(
  input: unknown,
): { text: string; labels: string[]; multiSelect: boolean } | null {
  if (!input || typeof input !== 'object') return null;
  const questions = (input as Record<string, unknown>).questions;
  if (!Array.isArray(questions) || questions.length === 0) return null;

  // Numeric mapping is only unambiguous for a single question — with several
  // questions each restarts its own 1..n, so a bare "1" could mean any of them.
  const singleQuestion = questions.length === 1;

  const blocks: string[] = [];
  let mappedLabels: string[] = [];
  let mappedMultiSelect = false;

  for (const raw of questions) {
    if (!raw || typeof raw !== 'object') continue;
    const q = raw as AskQuestion;
    const question = typeof q.question === 'string' ? q.question.trim() : '';
    if (!question) continue;

    const multiSelect = q.multiSelect === true;
    const lines = [`❓ ${question}`];
    const labels: string[] = [];
    const options = Array.isArray(q.options) ? q.options : [];
    for (const rawOption of options) {
      if (!rawOption || typeof rawOption !== 'object') continue;
      const option = rawOption as AskOption;
      const label = typeof option.label === 'string' ? option.label.trim() : '';
      if (!label) continue;
      const description = typeof option.description === 'string' ? option.description.trim() : '';
      labels.push(label);
      lines.push(description ? `${labels.length}. ${label} —— ${description}` : `${labels.length}. ${label}`);
    }

    lines.push(multiSelect
      ? '（可多选，回复序号或选项文字，多个用逗号分隔，如 1,2）'
      : '（回复序号或选项文字即可，如 1）');
    blocks.push(lines.join('\n'));

    if (singleQuestion) {
      mappedLabels = labels;
      mappedMultiSelect = multiSelect;
    }
  }

  if (blocks.length === 0) return null;
  return { text: blocks.join('\n\n'), labels: mappedLabels, multiSelect: mappedMultiSelect };
}

// Translate a bare numeric reply ("1", or "1,3" for multi-select) into the
// matching option label(s). Returns null when the reply is not a clean numeric
// selection (empty, non-numeric, out of range, or multi-number for a
// single-select prompt) — the caller then forwards the reply verbatim.
export function mapChoiceReply(text: string, labels: string[], multiSelect: boolean): string | null {
  if (labels.length === 0) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const tokens = trimmed.split(/[\s,，、]+/).filter(Boolean);
  if (tokens.length === 0) return null;
  if (!multiSelect && tokens.length > 1) return null;

  const picked: string[] = [];
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) return null;
    const index = Number(token);
    if (index < 1 || index > labels.length) return null;
    const label = labels[index - 1];
    if (!picked.includes(label)) picked.push(label);
  }
  return picked.length > 0 ? picked.join(', ') : null;
}
