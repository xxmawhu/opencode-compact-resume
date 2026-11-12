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
    entry: join(config, "plugin", `${pluginName}.ts`),
    lib: join(config, "plugin", pluginName),
    cleanup() {
      rmSync(base, { recursive: true, force: true });
    },
  };
}

function install(config, args = []) {
  return execFileSync("bash", [join(root, "install.sh"), ...args], {
    encoding: "utf8",
    env: { ...process.env, OPENCODE_CONFIG_DIR: config },
  });
}

// --verify is expected to fail closed, so the tests need the exit status and
// both streams instead of execFileSync's throw-on-nonzero behaviour.
function runInstaller(config, args = []) {
  return spawnSync("bash", [join(root, "install.sh"), ...args], {
    encoding: "utf8",
    env: { ...process.env, OPENCODE_CONFIG_DIR: config },
  });
}

function packageVersion() {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
}

test("copies the entry and every dist module into the config dir", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  install(box.config);

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
});

// Regression: the module dir used to keep mktemp's 0700 mode, so an OpenCode
// process running as a different account could not traverse it. `import` then
// failed before any hook existed and compaction silently produced no reminder.
test("installed artifacts are traversable and readable by other accounts", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  install(box.config);

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

  install(box.config);

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
  install(box.config);

  const result = runInstaller(box.config, ["--verify"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /current account:/);
  assert.match(result.stdout, /install marker: .*"version":"/);
  assert.ok(result.stdout.includes(packageVersion()), "marker version is reported");
  assert.match(result.stdout, /\[verify] ok:/);
});

test("--verify fails closed when the module dir is not traversable", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());
  install(box.config);
  chmodSync(box.lib, 0o700);

  const result = runInstaller(box.config, ["--verify"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not traversable by other users/);
  assert.match(result.stderr, /\[verify] FAILED:/);
});

test("--verify reports a missing install instead of guessing", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  const result = runInstaller(box.config, ["--verify"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not installed under/);
  assert.equal(existsSync(box.entry), false, "verify never installs anything");
});

test("--verify is read-only", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());
  install(box.config);

  const before = {
    files: readdirSync(box.lib).sort(),
    libMtime: statSync(box.lib).mtimeMs,
    entryMtime: statSync(box.entry).mtimeMs,
  };
  runInstaller(box.config, ["--verify"]);
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

  assert.throws(() => install(box.config), /cannot write .*plugin/);
});

test("reinstalling replaces the previous copy and leaves no staging dirs", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  install(box.config);
  install(box.config);

  const pluginDir = join(box.config, "plugin");
  const leftovers = readdirSync(pluginDir).filter((name) => name.startsWith(`.${pluginName}.`));
  assert.deepEqual(leftovers, []);
  assert.deepEqual(readdirSync(pluginDir).sort(), [pluginName, `${pluginName}.ts`].sort());
});

test("uninstall removes the entry and the module directory", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  install(box.config);
  install(box.config, ["--uninstall"]);

  assert.equal(existsSync(box.entry), false);
  assert.equal(existsSync(box.lib), false);
});

test("unknown arguments fail without touching the install", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  assert.throws(() => install(box.config, ["--nope"]), /unknown argument/);
  assert.equal(existsSync(box.entry), false);
});

test("the installed copy exposes the v1 hook factory", async (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  install(box.config);
  const hybrid = (await import(pathToFileURL(join(box.lib, "index.js")).href)).default;

  assert.equal(hybrid.id, pluginName);
  const hooks = await hybrid.server({
    client: { session: { promptAsync: async () => {} } },
  });
  assert.equal(typeof hooks.event, "function");
  assert.equal(typeof hooks["experimental.compaction.autocontinue"], "function");
});
