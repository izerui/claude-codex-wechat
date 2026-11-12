import { renderClaudeSystemPrompt } from '../../media/behavior.js';

// A fixed, constant instruction appended to every bridged Claude session via
// `--append-system-prompt`: honest environment context (the user is on WeChat,
// files can be sent to their WeChat, douyin links). It does not steer how Claude
// asks questions — AskUserQuestion / plan confirmations reach WeChat natively
// through the stdio permission prompt. See AGENTS.md.
//
// IMPORTANT for prompt caching: this MUST stay a byte-stable constant. It sits
// at the front of the prompt prefix, so any per-turn variation (timestamps,
// session names, random ids) here would invalidate the cache every turn.
// renderClaudeSystemPrompt() takes no arguments and reads no runtime state by
// design; it is evaluated once at module load. Never make it parameterised.
export const BRIDGE_APPEND_SYSTEM_PROMPT = renderClaudeSystemPrompt();
