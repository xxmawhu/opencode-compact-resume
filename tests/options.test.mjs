import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_TEXT } from "../dist/constants.js";
import { normalizeOptions } from "../dist/options.js";

test("the default reminder names every task source, including the compaction summary", () => {
  // Regression guard for the evidence-driven prompt: compaction drops the rules
  // and the task locations, so the reminder must name them explicitly.
  for (const source of ["memory/root.md", "AGENTS.md", "memory/long-plan.md", "plan/", "issues/"]) {
    assert.ok(DEFAULT_TEXT.includes(source), `default text must mention ${source}`);
  }
  // After compaction the next step may exist only as summary prose, so the
  // summary itself must be named as a task source (issue 3fcd2bef).
  for (const marker of ["压缩摘要", "待办", "Next Move", "下一步", "Active"]) {
    assert.ok(DEFAULT_TEXT.includes(marker), `default text must mention ${marker}`);
  }
});

test("the default reminder starts execution before producing a plan or a report", () => {
  // A context break drops the running tool loop; "continue" without an explicit
  // first action was satisfied by reporting instead of executing.
  assert.match(DEFAULT_TEXT, /立即执行第一项/);
  assert.match(DEFAULT_TEXT, /先调用工具/);
  assert.match(DEFAULT_TEXT, /不要先输出计划、盘点或请示/);
  assert.match(DEFAULT_TEXT, /直接采用/);
  assert.doesNotMatch(DEFAULT_TEXT, /没有任务/);
});

test("the default reminder only goes silent when every source is empty", () => {
  // The old "nothing pending" branch was read as "when unsure, end the turn".
  assert.match(DEFAULT_TEXT, /全部为空才保持静默/);
  assert.ok(DEFAULT_TEXT.indexOf("全部为空") < DEFAULT_TEXT.indexOf("保持静默"));
  assert.doesNotMatch(DEFAULT_TEXT, /有则继续执行/);
});

test("the default reminder treats every pending-work label the same", () => {
  // Issue d3cfbe2a: the summary wrote the next move as "if the user asks for
  // it", and the restore step treated the parenthesis as an external blocker.
  assert.match(DEFAULT_TEXT, /一律视为待办/);
  assert.match(DEFAULT_TEXT, /不因措辞/);
  assert.match(DEFAULT_TEXT, /计划/);
  assert.match(DEFAULT_TEXT, /TODO/);
  assert.match(DEFAULT_TEXT, /自设条件不构成跳过理由/);
  assert.match(DEFAULT_TEXT, /默认执行并说明理由/);
  assert.doesNotMatch(DEFAULT_TEXT, /若用户要求\s*即\s*跳过/);
});

test("the default reminder explains real external dependencies instead of dropping them", () => {
  // A blocker is allowed, but it must be verbalised: reason, unlock criterion,
  // required action, and the item stays visible.
  assert.match(DEFAULT_TEXT, /BLOCKED:/);
  assert.match(DEFAULT_TEXT, /阻塞原因/);
  assert.match(DEFAULT_TEXT, /解锁判据/);
  assert.match(DEFAULT_TEXT, /所需动作/);
  assert.match(DEFAULT_TEXT, /仍须回显该待办/);
  assert.match(DEFAULT_TEXT, /禁止静默丢弃任务/);
});

test("the default reminder keeps requirement sections and verbatim context above the summary", () => {
  // The summary is an index, not the source of truth: constraint sections and
  // the conversation text that survives compaction must stay authoritative.
  assert.match(DEFAULT_TEXT, /摘要只作线索/);
  assert.match(DEFAULT_TEXT, /Requirements \/ Decisions \/ Constraints/);
  assert.match(DEFAULT_TEXT, /原文/);
  assert.match(DEFAULT_TEXT, /优先于摘要/);
  assert.match(DEFAULT_TEXT, /以原文和当前事实为准/);
  // The host tells the model not to describe the compaction, so the reminder
  // must not open by framing the context as damaged.
  assert.doesNotMatch(DEFAULT_TEXT, /细节可能已丢失/);
});

test("the default reminder verifies finished work before repeating it", () => {
  // Resuming can replay an action that already completed during compaction.
  assert.match(DEFAULT_TEXT, /先核实它是否已完成/);
  assert.match(DEFAULT_TEXT, /已完成则跳过/);
  assert.match(DEFAULT_TEXT, /不重复动作/);
});

test("the default reminder keeps recovery bookkeeping internal", () => {
  // Enumerating pending items is a self-check; repeating it to the user is noise.
  assert.match(DEFAULT_TEXT, /在内部逐条回显/);
  assert.match(DEFAULT_TEXT, /不向用户复述摘要或恢复过程/);
});

test("the default reminder states the action a blocker needs from the user", () => {
  assert.match(DEFAULT_TEXT, /需要用户提供信息或决策时写明需要用户做什么/);
});

test("the default reminder checks summary claims against the real directories", () => {
  // Issue e1cc5012: the summary dropped a just-issued instruction and still
  // asserted "issues/ empty" while the file existed.
  assert.match(DEFAULT_TEXT, /Pending user instructions/);
  assert.match(DEFAULT_TEXT, /ls -A plan\/ issues\//);
  assert.match(DEFAULT_TEXT, /以文件系统为准/);
  assert.match(DEFAULT_TEXT, /逐条回显/);
  // Pending instructions must rank before the work-state summary.
  assert.ok(
    DEFAULT_TEXT.indexOf("Pending user instructions") <
      DEFAULT_TEXT.indexOf("「待办 / Next Move / 下一步 / Active / 计划 / TODO」"),
  );
  // A missing section is stated, never read as "nothing pending".
  assert.match(DEFAULT_TEXT, /明确说明该线索缺失/);
  assert.match(DEFAULT_TEXT, /不得据此断言无待办/);
});

test("defaults with an empty environment", () => {
  const config = normalizeOptions(undefined, {});
  assert.equal(config.enabled, true);
  assert.equal(config.text, DEFAULT_TEXT);
  assert.equal(config.includeChildSessions, false);
  assert.equal(config.suppressBuiltinAutoContinue, false);
  assert.equal(config.verbose, false);
});

test("environment variables override defaults", () => {
  const config = normalizeOptions(undefined, {
    OPENCODE_COMPACT_RESUME_TEXT: "  resume please  ",
    OPENCODE_COMPACT_RESUME_INCLUDE_CHILD_SESSIONS: "yes",
    OPENCODE_COMPACT_RESUME_SUPPRESS_BUILTIN_AUTO_CONTINUE: "1",
    OPENCODE_COMPACT_RESUME_VERBOSE: "on",
  });
  assert.equal(config.text, "resume please");
  assert.equal(config.includeChildSessions, true);
  assert.equal(config.suppressBuiltinAutoContinue, true);
  assert.equal(config.verbose, true);
});

test("explicit options take precedence over the environment", () => {
  const config = normalizeOptions(
    { text: "option text", includeChildSessions: false, verbose: false },
    {
      OPENCODE_COMPACT_RESUME_TEXT: "env text",
      OPENCODE_COMPACT_RESUME_INCLUDE_CHILD_SESSIONS: "true",
      OPENCODE_COMPACT_RESUME_VERBOSE: "true",
    },
  );
  assert.equal(config.text, "option text");
  assert.equal(config.includeChildSessions, false);
  assert.equal(config.verbose, false);
});

test("OPENCODE_COMPACT_RESUME_DISABLED turns the plugin off", () => {
  assert.equal(
    normalizeOptions(undefined, { OPENCODE_COMPACT_RESUME_DISABLED: "true" }).enabled,
    false,
  );
  assert.equal(
    normalizeOptions(undefined, { OPENCODE_COMPACT_RESUME_DISABLED: "false" }).enabled,
    true,
  );
});

test("invalid values fall back to defaults", () => {
  const config = normalizeOptions(
    {
      text: "   ",
      includeChildSessions: "maybe",
      verbose: 42,
    },
    {
      OPENCODE_COMPACT_RESUME_TEXT: "",
    },
  );
  assert.equal(config.text, DEFAULT_TEXT);
  assert.equal(config.includeChildSessions, false);
  assert.equal(config.verbose, false);
});

test("boolean strings are parsed case-insensitively", () => {
  assert.equal(normalizeOptions({ enabled: "FALSE" }, {}).enabled, false);
  assert.equal(normalizeOptions({ includeChildSessions: "True" }, {}).includeChildSessions, true);
  assert.equal(normalizeOptions({ verbose: "off" }, {}).verbose, false);
});
