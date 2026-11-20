import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginName = "opencode-compact-resume";

function sandbox() {
  // Kept under tests/ on purpose: artifacts must never land in /tmp or in a
  // production data directory.
  const base = mkdtempSync(join(root, "tests", ".tmp-install-"));
  const config = join(base, "opencode");
  return {
    config,
    // install.sh defaults its log to the checkout's log/. Without this override
    // the expected failures below land in the production install log and get
    // counted as real defects by log inspection.
    logs: join(base, "log"),
    entry: join(config, "plugin", `${pluginName}.ts`),
    lib: join(config, `${pluginName}-lib`),
    legacyLib: join(config, "plugin", pluginName),
    legacyScannedLib: join(config, "plugin", `${pluginName}-lib`),
    cleanup() {
      rmSync(base, { recursive: true, force: true });
    },
  };
}

function install(box, args = []) {
  return execFileSync("bash", [join(root, "install.sh"), ...args], {
    encoding: "utf8",
    // A hung installer must fail the test instead of blocking the runner.
    timeout: 60_000,
    env: {
      ...process.env,
      OPENCODE_CONFIG_DIR: box.config,
      OPENCODE_INSTALL_LOG_DIR: box.logs,
    },
  });
}

// --verify is expected to fail closed, so the tests need the exit status and
// both streams instead of execFileSync's throw-on-nonzero behaviour.
function runInstaller(box, args = []) {
  return spawnSync("bash", [join(root, "install.sh"), ...args], {
    encoding: "utf8",
    // A hung installer must fail the test instead of blocking the runner.
    timeout: 60_000,
    env: {
      ...process.env,
      OPENCODE_CONFIG_DIR: box.config,
      OPENCODE_INSTALL_LOG_DIR: box.logs,
    },
  });
}

function todayStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

function packageVersion() {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
}

test("copies the entry and every dist module into the config dir", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  install(box);

  assert.ok(existsSync(box.entry), "entry file is installed");
  assert.ok(existsSync(join(box.lib, "index.js")), "index.js is installed");
  for (const module of readdirSync(join(root, "dist")).filter((name) => name.endsWith(".js"))) {
    assert.ok(existsSync(join(box.lib, module)), `${module} is installed`);
  }

  const manifest = JSON.parse(readFileSync(join(box.lib, "package.json"), "utf8"));
  assert.equal(manifest.type, "module");

  // opencode2 reads the default export as an object ({ id, setup }); a
  // function default fails with SchemaError(Expected object). v1 calls
  // `server()` on the same object. Named exports would be loaded as extra v1
  // plugin functions.
  const entry = readFileSync(box.entry, "utf8");
  assert.match(entry, /export default hybrid;/);
  assert.doesNotMatch(entry, /export\s+(const|let|var|function|class|\{)/);
  assert.match(
    entry,
    /from "\.\.\/opencode-compact-resume-lib\/index\.js"/,
    "entry imports the module dir from outside the plugin scan path",
  );

  // opencode2 loads every first-level directory under plugin/ as a plugin, so
  // the module dir must not live there and no legacy copy may remain.
  assert.equal(existsSync(box.legacyLib), false, "no module dir inside plugin/");
  const pluginEntries = readdirSync(join(box.config, "plugin"));
  assert.deepEqual(pluginEntries, [`${pluginName}.ts`]);
});

// Regression: the module dir used to keep mktemp's 0700 mode, so an OpenCode
// process running as a different account could not traverse it. `import` then
// failed before any hook existed and compaction silently produced no reminder.
test("installed artifacts are traversable and readable by other accounts", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  install(box);

  assert.equal(statSync(box.lib).mode & 0o777, 0o755, "module dir must stay traversable");

  const readable = [box.entry, join(box.lib, "package.json"), join(box.lib, ".install-info")];
  for (const module of readdirSync(join(root, "dist")).filter((name) => name.endsWith(".js"))) {
    readable.push(join(box.lib, module));
  }
  for (const file of readable) {
    assert.equal(statSync(file).mode & 0o777, 0o644, `${file} must stay world-readable`);
  }
});

test("install writes a readable marker with the shipped version", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  install(box);

  const markerPath = join(box.lib, ".install-info");
  assert.equal(statSync(markerPath).mode & 0o777, 0o644, "marker stays world-readable");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  assert.equal(marker.name, pluginName);
  assert.equal(marker.version, packageVersion());
  assert.match(marker.installedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test("--verify accepts a fresh install and reports the marker", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());
  install(box);

  const result = runInstaller(box, ["--verify"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /current account:/);
  assert.match(result.stdout, /install marker: .*"version":"/);
  assert.ok(result.stdout.includes(packageVersion()), "marker version is reported");
  assert.match(result.stdout, /\[verify] ok:/);
});

test("--verify fails closed when the module dir is not traversable", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());
  install(box);
  chmodSync(box.lib, 0o700);

  const result = runInstaller(box, ["--verify"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not traversable by other users/);
  assert.match(result.stderr, /\[verify] FAILED:/);
});

test("--verify reports a missing install instead of guessing", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  const result = runInstaller(box, ["--verify"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not installed under/);
  assert.equal(existsSync(box.entry), false, "verify never installs anything");
});

test("--verify is read-only", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());
  install(box);

  const before = {
    files: readdirSync(box.lib).sort(),
    libMtime: statSync(box.lib).mtimeMs,
    entryMtime: statSync(box.entry).mtimeMs,
  };
  runInstaller(box, ["--verify"]);
  const after = {
    files: readdirSync(box.lib).sort(),
    libMtime: statSync(box.lib).mtimeMs,
    entryMtime: statSync(box.entry).mtimeMs,
  };

  assert.deepEqual(after, before);
});

test("a plugin dir the installer cannot write fails with the real reason", (t) => {
  const box = sandbox();
  mkdirSync(join(box.config, "plugin"), { recursive: true });
  chmodSync(join(box.config, "plugin"), 0o555);
  t.after(() => {
    chmodSync(join(box.config, "plugin"), 0o755);
    box.cleanup();
  });

  assert.throws(() => install(box), /cannot write .*plugin/);
});

test("reinstalling replaces the previous copy and leaves no staging dirs", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  install(box);
  install(box);

  const pluginDir = join(box.config, "plugin");
  const leftovers = readdirSync(pluginDir).filter((name) => name.startsWith(`.${pluginName}`));
  assert.deepEqual(leftovers, []);
  assert.deepEqual(readdirSync(pluginDir), [`${pluginName}.ts`]);
  const configLeftovers = readdirSync(box.config).filter((name) => name.includes(".stage."));
  assert.deepEqual(configLeftovers, []);
});

// Regression: 0.1.6 installed the module dir into plugin/opencode-compact-resume/,
// which opencode2 loads as a second plugin. Reinstalling must move the library
// out of the scan path instead of leaving the old copy behind.
test("installing over the legacy layout removes the module dir from plugin/", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  mkdirSync(box.legacyLib, { recursive: true });
  const legacyMarker = join(box.legacyLib, "index.js");
  writeFileSync(legacyMarker, "export default {};\n");

  const output = install(box);

  assert.match(output, /removed legacy module dir/);
  assert.equal(existsSync(box.legacyLib), false);
  assert.ok(existsSync(join(box.lib, "index.js")));
  assert.deepEqual(readdirSync(join(box.config, "plugin")), [`${pluginName}.ts`]);
});

test("--verify rejects the legacy layout still inside plugin/", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());
  install(box);
  mkdirSync(box.legacyLib, { recursive: true });

  const result = runInstaller(box, ["--verify"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /legacy module dir inside the plugin scan path/);
});

// Contract R6: a repeated install with unchanged content must not bump the
// timestamps of the installed copy; only a content change rewrites files.
test("reinstalling unchanged content keeps mtimes and the marker", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  install(box);
  const markerPath = join(box.lib, ".install-info");
  const before = {
    lib: statSync(box.lib, { bigint: true }).mtimeNs,
    entry: statSync(box.entry, { bigint: true }).mtimeNs,
    marker: statSync(markerPath, { bigint: true }).mtimeNs,
    markerBody: readFileSync(markerPath, "utf8"),
  };

  const output = install(box);

  assert.match(output, /unchanged .*opencode-compact-resume-lib/);
  assert.match(output, /unchanged .*opencode-compact-resume\.ts/);
  assert.equal(statSync(box.lib, { bigint: true }).mtimeNs, before.lib);
  assert.equal(statSync(box.entry, { bigint: true }).mtimeNs, before.entry);
  assert.equal(statSync(markerPath, { bigint: true }).mtimeNs, before.marker);
  assert.equal(readFileSync(markerPath, "utf8"), before.markerBody);
});

// Regression: a module dir at plugin/<name>-lib/ would be loaded by opencode2
// as a second plugin (contract R1/R6).
test("installing removes a module dir left at plugin/<name>-lib/", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  mkdirSync(box.legacyScannedLib, { recursive: true });
  writeFileSync(join(box.legacyScannedLib, "index.js"), "export default {};\n");

  const output = install(box);

  assert.match(output, /removed legacy module dir/);
  assert.equal(existsSync(box.legacyScannedLib), false);
  assert.deepEqual(readdirSync(join(box.config, "plugin")), [`${pluginName}.ts`]);
});

test("--verify rejects a module dir still at plugin/<name>-lib/", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());
  install(box);
  mkdirSync(box.legacyScannedLib, { recursive: true });

  const result = runInstaller(box, ["--verify"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /legacy module dir inside the plugin scan path/);
});

test("uninstall removes the entry and the module directory", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  install(box);
  install(box, ["--uninstall"]);

  assert.equal(existsSync(box.entry), false);
  assert.equal(existsSync(box.lib), false);
});

test("uninstall also removes a legacy module dir inside plugin/", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  mkdirSync(box.legacyLib, { recursive: true });
  install(box, ["--uninstall"]);

  assert.equal(existsSync(box.legacyLib), false);
});

test("unknown arguments fail without touching the install", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  assert.throws(() => install(box, ["--nope"]), /unknown argument/);
  assert.equal(existsSync(box.entry), false);
});

// Regression: these tests used to inherit install.sh's default log dir, so
// expected failures wrote [ERROR] lines into the checkout's log/ and were
// counted as production defects. The sandbox must absorb every line instead.
test("installer runs write to the sandbox log, never the repo log", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());
  const repoLog = join(root, "log", `install.${todayStamp()}.log`);
  const repoSize = () => (existsSync(repoLog) ? statSync(repoLog).size : -1);
  const before = repoSize();

  install(box);

  const logFiles = readdirSync(box.logs).filter((name) => name.startsWith("install."));
  assert.equal(logFiles.length, 1, `exactly one sandbox install log, got ${logFiles.join(",")}`);
  assert.match(readFileSync(join(box.logs, logFiles[0]), "utf8"), /\[stage:install\] installed/);
  assert.equal(repoSize(), before, "the repo install log must not grow");
});

test("the installed copy exposes the v1 hook factory", async (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  install(box);
  const hybrid = (await import(pathToFileURL(join(box.lib, "index.js")).href)).default;

  assert.equal(hybrid.id, pluginName);
  const hooks = await hybrid.server({
    client: { session: { promptAsync: async () => {} } },
  });
  assert.equal(typeof hooks.event, "function");
  assert.equal(typeof hooks["experimental.compaction.autocontinue"], "function");
});
