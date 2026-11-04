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
 * - The summary can write the next step as a self-imposed condition ("if the
 *   user asks for it"), and the restore step read the parenthesis as an external
 *   blocker (issue d3cfbe2a). Every summary section that names pending work
 *   ("todos", "plan", "next step", "next move") is therefore treated the same,
 *   no matter which label the summary chose.
 * - A real external dependency must not become a silent drop: `BLOCKED:` is the
 *   only accepted marker and it must state the reason, the unlock criterion and
 *   the required action, and the item is still echoed.
 * - The summary may also drop a just-issued user instruction and still assert
 *   "directory empty" (issue e1cc5012). So pending user instructions rank first,
 *   directory claims are verified against the filesystem, and a missing todos
 *   verdict must enumerate every pending item with evidence.
 */
export const DEFAULT_TEXT = `压缩完成，细节可能已丢失。按顺序恢复执行：
1. 读取 memory/root.md（最高准则）与 AGENTS.md（规则）。
2. 找出待办，按优先级：摘要的「Pending user instructions」> 摘要的「待办 / Next Move / 下一步 / Active / 计划 / TODO」等段落 > memory/long-plan.md 的 - [ ] 项 > plan/ 的待执行项 > issues/ 的未处理项。
3. 上述段落一律视为待办，不因措辞（待办 / 计划 / 下一步 / Next Move）区别对待；「若用户要求 / 视情况 / 待确认」等自设条件不构成跳过理由，默认执行并说明理由。
4. 遇真实外部依赖时写 BLOCKED: 并说明阻塞原因、解锁判据与所需动作，仍须回显该待办；禁止静默丢弃任务。只有写明解锁判据的 BLOCKED: 才算阻塞。
5. 压缩摘要声称「目录为空 / 无待办」时用 ls -A plan/ issues/ 核对；与文件系统不一致以文件系统为准并把差异列为待办。摘要没有「Pending user instructions」时明确说明该线索缺失，不得据此断言无待办。
6. 有待办就立即执行第一项：先调用工具，不要先输出计划、盘点或请示；存在默认推荐做法时直接采用，不要询问是否继续。
7. 声明「无待办」前逐条回显每个待办项的处理结论（执行 / BLOCKED 原因 + 证据）；全部为空才保持静默，不输出空闲汇报。`;
export const ENV_PREFIX = "OPENCODE_COMPACT_RESUME_";
//# sourceMappingURL=constants.js.map