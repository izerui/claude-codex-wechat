import { renderClaudeSystemPrompt } from '../../media/behavior.js';

// A fixed, constant instruction appended to every bridged Claude session via
// `--append-system-prompt`. It tells the model the truth about its runtime: a
// plain-text WeChat channel with no interactive UI, so it should present choices
// as numbered text rather than calling AskUserQuestion (which is auto-denied in
// headless mode and produces a confusing double message). See AGENTS.md — this
// is honest environment context, not a reinvention of native behavior.
//
// IMPORTANT for prompt caching: this MUST stay a byte-stable constant. It sits
// at the front of the prompt prefix, so any per-turn variation (timestamps,
// session names, random ids) here would invalidate the cache every turn.
// renderClaudeSystemPrompt() takes no arguments and reads no runtime state by
// design; it is evaluated once at module load. Never make it parameterised.
export const BRIDGE_APPEND_SYSTEM_PROMPT = renderClaudeSystemPrompt();
