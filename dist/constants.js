/**
 * Stable identifiers and defaults shared by the v1 and v2 entrypoints.
 */
export const PLUGIN_ID = "opencode-compact-resume";
/**
 * Injected after every completed compaction.
 *
 * Evidence for this wording (see README "维护原则"):
 * - Compaction keeps only a summary, so the rules themselves are lost: the
 *   host rules require re-reading `memory/root.md` and `AGENTS.md` after a
 *   context break.
 * - Unfinished work has concrete locations, so naming them beats the previous
 *   vague "memory todos": `memory/long-plan.md` uses `- [ ]`, plans live in
 *   `plan/`, issues in `issues/`.
 * - The previous text asked the agent to check but not what to do when nothing
 *   is pending, which invites an idle status report.
 */
export const DEFAULT_TEXT = "压缩完成，细节可能已丢失。请先重新读取 memory/root.md（最高准则）与 AGENTS.md（规则），再检查未完成任务：memory/long-plan.md 的未勾选项、plan/ 的待执行项、issues/ 的未处理项，以及当前上下文里的待办。有则继续执行；没有则保持静默，不要输出空闲汇报。";
export const ENV_PREFIX = "OPENCODE_COMPACT_RESUME_";
//# sourceMappingURL=constants.js.map