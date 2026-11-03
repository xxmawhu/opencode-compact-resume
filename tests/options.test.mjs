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
