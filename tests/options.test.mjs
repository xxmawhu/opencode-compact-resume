import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_TEXT } from "../dist/constants.js";
import { normalizeOptions } from "../dist/options.js";

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
