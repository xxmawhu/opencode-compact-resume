/**
 * Stable identifiers and defaults shared by the v1 and v2 entrypoints.
 */
export declare const PLUGIN_ID = "opencode-compact-resume";
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
export declare const DEFAULT_TEXT = "\u538B\u7F29\u5B8C\u6210\uFF0C\u7EC6\u8282\u53EF\u80FD\u5DF2\u4E22\u5931\u3002\u6309\u987A\u5E8F\u6062\u590D\u6267\u884C\uFF1A\n1. \u8BFB\u53D6 memory/root.md\uFF08\u6700\u9AD8\u51C6\u5219\uFF09\u4E0E AGENTS.md\uFF08\u89C4\u5219\uFF09\u3002\n2. \u627E\u51FA\u5F85\u529E\uFF1A\u672C\u6B21\u538B\u7F29\u6458\u8981\u91CC\u7684\u300C\u5F85\u529E / Next Move / \u4E0B\u4E00\u6B65 / Active\u300D\u6BB5\u843D\uFF0C\u4EE5\u53CA memory/long-plan.md \u7684 - [ ] \u9879\u3001plan/ \u7684\u5F85\u6267\u884C\u9879\u3001issues/ \u7684\u672A\u5904\u7406\u9879\u3002\n3. \u6709\u5F85\u529E\u5C31\u7ACB\u5373\u6267\u884C\u7B2C\u4E00\u9879\uFF1A\u5148\u8C03\u7528\u5DE5\u5177\uFF0C\u4E0D\u8981\u5148\u8F93\u51FA\u8BA1\u5212\u3001\u76D8\u70B9\u6216\u8BF7\u793A\uFF1B\u5B58\u5728\u9ED8\u8BA4\u63A8\u8350\u505A\u6CD5\u65F6\u76F4\u63A5\u91C7\u7528\uFF0C\u4E0D\u8981\u8BE2\u95EE\u662F\u5426\u7EE7\u7EED\u3002\n4. \u5168\u90E8\u4E3A\u7A7A\u624D\u4FDD\u6301\u9759\u9ED8\uFF0C\u4E0D\u8F93\u51FA\u7A7A\u95F2\u6C47\u62A5\u3002";
export declare const ENV_PREFIX = "OPENCODE_COMPACT_RESUME_";
//# sourceMappingURL=constants.d.ts.map