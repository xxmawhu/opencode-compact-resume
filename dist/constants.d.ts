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
 * - The previous text asked the agent to check but not what to do when nothing
 *   is pending, which invites an idle status report.
 */
export declare const DEFAULT_TEXT = "\u538B\u7F29\u5B8C\u6210\uFF0C\u7EC6\u8282\u53EF\u80FD\u5DF2\u4E22\u5931\u3002\u8BF7\u5148\u91CD\u65B0\u8BFB\u53D6 memory/root.md\uFF08\u6700\u9AD8\u51C6\u5219\uFF09\u4E0E AGENTS.md\uFF08\u89C4\u5219\uFF09\uFF0C\u518D\u68C0\u67E5\u672A\u5B8C\u6210\u4EFB\u52A1\uFF1Amemory/long-plan.md \u7684\u672A\u52FE\u9009\u9879\u3001plan/ \u7684\u5F85\u6267\u884C\u9879\u3001issues/ \u7684\u672A\u5904\u7406\u9879\uFF0C\u4EE5\u53CA\u5F53\u524D\u4E0A\u4E0B\u6587\u91CC\u7684\u5F85\u529E\u3002\u6709\u5219\u7EE7\u7EED\u6267\u884C\uFF1B\u6CA1\u6709\u5219\u4FDD\u6301\u9759\u9ED8\uFF0C\u4E0D\u8981\u8F93\u51FA\u7A7A\u95F2\u6C47\u62A5\u3002";
export declare const ENV_PREFIX = "OPENCODE_COMPACT_RESUME_";
//# sourceMappingURL=constants.d.ts.map