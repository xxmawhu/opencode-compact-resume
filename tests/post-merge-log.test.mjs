import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// Regression: install.sh only wrote to the console, so a post-merge run under
// repo-keeper (no terminal) lost the failure reason of set -euo pipefail steps.
// These tests pin the durable log, the console hint and the hook wrapper.
function sandbox() {
  // Kept under tests/ on purpose: artifacts must never land in /tmp or in a
  // production data directory.
  const base = mkdtempSync(join(root, "tests", ".tmp-postmerge-"));
  return {
    base,
    config: join(base, "opencode"),
    logs: join(base, "log"),
    cleanup() {
      rmSync(base, { recursive: true, force: true });
    },
  };
}

function run(script, box, args = []) {
  return spawnSync("bash", [join(root, script), ...args], {
    encoding: "utf8",
    // A hung installer must fail the suite instead of blocking the runner.
    timeout: 60_000,
    env: {
      ...process.env,
      OPENCODE_CONFIG_DIR: box.config,
      OPENCODE_INSTALL_LOG_DIR: box.logs,
    },
  });
}

function logText(box, name) {
  const files = readdirSync(box.logs).filter((file) => file.startsWith(name));
  assert.equal(files.length, 1, `exactly one ${name} log file, got ${files.join(",")}`);
  return readFileSync(join(box.logs, files[0]), "utf8");
}

test("install writes a timestamped log line with the install stage", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  const result = run("install.sh", box);

  assert.equal(result.status, 0, result.stderr);
  const log = logText(box, "install.");
  assert.match(log, /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[INFO\] \[stage:install\] /m);
  assert.match(log, /\[stage:install\] installed .*opencode-compact-resume-lib\//);
});

test("a failed install logs the reason and points at the log file", (t) => {
  const box = sandbox();
  mkdirSync(join(box.config, "plugin"), { recursive: true });
  chmodSync(join(box.config, "plugin"), 0o555);
  t.after(() => {
    chmodSync(join(box.config, "plugin"), 0o755);
    box.cleanup();
  });

  const result = run("install.sh", box);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot write .*plugin/);
  assert.match(result.stderr, /详见 .*install\.\d{8}\.log/);
  const log = logText(box, "install.");
  assert.match(log, /\[ERROR\] \[stage:install\] cannot write .*plugin/);
});

test("--verify stays read-only and creates no log directory", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  const result = run("install.sh", box, ["--verify"]);

  assert.notEqual(result.status, 0);
  assert.equal(existsSync(box.logs), false, "verify must not create the log dir");
});

test("post-merge hook logs the full transcript and succeeds", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  const result = run("scripts/post-merge-hook.sh", box);

  assert.equal(result.status, 0, result.stderr);
  const log = logText(box, "post-merge-hook.");
  assert.match(log, /\[INFO\] \[stage:post-merge\] start: bash .*install\.sh/);
  assert.match(log, /\[stage:post-merge\] \[install\] installed .*opencode-compact-resume\.ts/);
  assert.match(log, /\[INFO\] \[stage:post-merge\] install\.sh rc=0/);
});

test("post-merge hook keeps the failure reason in its own log", (t) => {
  const box = sandbox();
  mkdirSync(join(box.config, "plugin"), { recursive: true });
  chmodSync(join(box.config, "plugin"), 0o555);
  t.after(() => {
    chmodSync(join(box.config, "plugin"), 0o755);
    box.cleanup();
  });

  const result = run("scripts/post-merge-hook.sh", box);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /install\.sh failed \(rc=1\); 详见 .*post-merge-hook\.\d{8}\.log/);
  const log = logText(box, "post-merge-hook.");
  assert.match(log, /\[ERROR\] \[stage:post-merge\] \[install\] error: cannot write .*plugin/);
  assert.match(log, /\[ERROR\] \[stage:post-merge\] install\.sh rc=1/);
});
