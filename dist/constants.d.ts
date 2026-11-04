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
export declare const DEFAULT_TEXT = "\u538B\u7F29\u5B8C\u6210\uFF0C\u7EC6\u8282\u53EF\u80FD\u5DF2\u4E22\u5931\u3002\u6309\u987A\u5E8F\u6062\u590D\u6267\u884C\uFF1A\n1. \u8BFB\u53D6 memory/root.md\uFF08\u6700\u9AD8\u51C6\u5219\uFF09\u4E0E AGENTS.md\uFF08\u89C4\u5219\uFF09\u3002\n2. \u627E\u51FA\u5F85\u529E\uFF0C\u6309\u4F18\u5148\u7EA7\uFF1A\u6458\u8981\u7684\u300CPending user instructions\u300D> \u6458\u8981\u7684\u300C\u5F85\u529E / Next Move / \u4E0B\u4E00\u6B65 / Active / \u8BA1\u5212 / TODO\u300D\u7B49\u6BB5\u843D > memory/long-plan.md \u7684 - [ ] \u9879 > plan/ \u7684\u5F85\u6267\u884C\u9879 > issues/ \u7684\u672A\u5904\u7406\u9879\u3002\n3. \u4E0A\u8FF0\u6BB5\u843D\u4E00\u5F8B\u89C6\u4E3A\u5F85\u529E\uFF0C\u4E0D\u56E0\u63AA\u8F9E\uFF08\u5F85\u529E / \u8BA1\u5212 / \u4E0B\u4E00\u6B65 / Next Move\uFF09\u533A\u522B\u5BF9\u5F85\uFF1B\u300C\u82E5\u7528\u6237\u8981\u6C42 / \u89C6\u60C5\u51B5 / \u5F85\u786E\u8BA4\u300D\u7B49\u81EA\u8BBE\u6761\u4EF6\u4E0D\u6784\u6210\u8DF3\u8FC7\u7406\u7531\uFF0C\u9ED8\u8BA4\u6267\u884C\u5E76\u8BF4\u660E\u7406\u7531\u3002\n4. \u9047\u771F\u5B9E\u5916\u90E8\u4F9D\u8D56\u65F6\u5199 BLOCKED: \u5E76\u8BF4\u660E\u963B\u585E\u539F\u56E0\u3001\u89E3\u9501\u5224\u636E\u4E0E\u6240\u9700\u52A8\u4F5C\uFF0C\u4ECD\u987B\u56DE\u663E\u8BE5\u5F85\u529E\uFF1B\u7981\u6B62\u9759\u9ED8\u4E22\u5F03\u4EFB\u52A1\u3002\u53EA\u6709\u5199\u660E\u89E3\u9501\u5224\u636E\u7684 BLOCKED: \u624D\u7B97\u963B\u585E\u3002\n5. \u538B\u7F29\u6458\u8981\u58F0\u79F0\u300C\u76EE\u5F55\u4E3A\u7A7A / \u65E0\u5F85\u529E\u300D\u65F6\u7528 ls -A plan/ issues/ \u6838\u5BF9\uFF1B\u4E0E\u6587\u4EF6\u7CFB\u7EDF\u4E0D\u4E00\u81F4\u4EE5\u6587\u4EF6\u7CFB\u7EDF\u4E3A\u51C6\u5E76\u628A\u5DEE\u5F02\u5217\u4E3A\u5F85\u529E\u3002\u6458\u8981\u6CA1\u6709\u300CPending user instructions\u300D\u65F6\u660E\u786E\u8BF4\u660E\u8BE5\u7EBF\u7D22\u7F3A\u5931\uFF0C\u4E0D\u5F97\u636E\u6B64\u65AD\u8A00\u65E0\u5F85\u529E\u3002\n6. \u6709\u5F85\u529E\u5C31\u7ACB\u5373\u6267\u884C\u7B2C\u4E00\u9879\uFF1A\u5148\u8C03\u7528\u5DE5\u5177\uFF0C\u4E0D\u8981\u5148\u8F93\u51FA\u8BA1\u5212\u3001\u76D8\u70B9\u6216\u8BF7\u793A\uFF1B\u5B58\u5728\u9ED8\u8BA4\u63A8\u8350\u505A\u6CD5\u65F6\u76F4\u63A5\u91C7\u7528\uFF0C\u4E0D\u8981\u8BE2\u95EE\u662F\u5426\u7EE7\u7EED\u3002\n7. \u58F0\u660E\u300C\u65E0\u5F85\u529E\u300D\u524D\u9010\u6761\u56DE\u663E\u6BCF\u4E2A\u5F85\u529E\u9879\u7684\u5904\u7406\u7ED3\u8BBA\uFF08\u6267\u884C / BLOCKED \u539F\u56E0 + \u8BC1\u636E\uFF09\uFF1B\u5168\u90E8\u4E3A\u7A7A\u624D\u4FDD\u6301\u9759\u9ED8\uFF0C\u4E0D\u8F93\u51FA\u7A7A\u95F2\u6C47\u62A5\u3002";
export declare const ENV_PREFIX = "OPENCODE_COMPACT_RESUME_";
//# sourceMappingURL=constants.d.ts.map