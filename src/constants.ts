/**
 * Stable identifiers and defaults shared by the v1 and v2 entrypoints.
 */
export const PLUGIN_ID = "opencode-compact-resume";

/**
 * Injected after every completed compaction. Kept verbatim so the reminder
 * covers all four task sources named by the project requirements:
 * issues, pending plan items, conversation context and memory todos.
 */
export const DEFAULT_TEXT =
  "请检查是否未完成的任务，如果有则继续工作。所谓的任务包含：issues,plan的待执行规划以及上下文和memory系统里的待做项。";

/**
 * Guards against duplicate injections when the same compaction event is
 * delivered more than once (v1 can emit duplicates, see ULW-PM history).
 */
export const DEFAULT_COOLDOWN_MS = 15_000;

export const ENV_PREFIX = "OPENCODE_COMPACT_RESUME_";
