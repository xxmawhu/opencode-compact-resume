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
 * - The summary itself carries the next step (`Active` / `Next Move`), often as
 *   prose rather than a checkbox. Omitting it let the agent treat the next move
 *   as background and report instead of executing (issue 3fcd2bef).
 * - "Continue" had no starting point after the tool loop was dropped, and
 *   "nothing pending" invited the cheapest reading: declare nothing pending and
 *   end the turn. The text therefore names the first action (call a tool before
 *   writing a plan/report) and restricts silence to the all-empty branch.
 */
export const DEFAULT_TEXT = `压缩完成，细节可能已丢失。按顺序恢复执行：
1. 读取 memory/root.md（最高准则）与 AGENTS.md（规则）。
2. 找出待办：本次压缩摘要里的「待办 / Next Move / 下一步 / Active」段落，以及 memory/long-plan.md 的 - [ ] 项、plan/ 的待执行项、issues/ 的未处理项。
3. 有待办就立即执行第一项：先调用工具，不要先输出计划、盘点或请示；存在默认推荐做法时直接采用，不要询问是否继续。
4. 全部为空才保持静默，不输出空闲汇报。`;
export const ENV_PREFIX = "OPENCODE_COMPACT_RESUME_";
//# sourceMappingURL=constants.js.map