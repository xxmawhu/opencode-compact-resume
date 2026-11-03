import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  assert.match(readFileSync(box.entry, "utf8"), /hybrid\.server\(input\)/);
});

// Regression: the module dir used to keep mktemp's 0700 mode, so an OpenCode
// process running as a different account could not traverse it. `import` then
// failed before any hook existed and compaction silently produced no reminder.
test("installed artifacts are traversable and readable by other accounts", (t) => {
  const box = sandbox();
  t.after(() => box.cleanup());

  install(box.config);

  assert.equal(statSync(box.lib).mode & 0o777, 0o755, "module dir must stay traversable");

  const readable = [box.entry, join(box.lib, "package.json")];
  for (const module of readdirSync(join(root, "dist")).filter((name) => name.endsWith(".js"))) {
    readable.push(join(box.lib, module));
  }
  for (const file of readable) {
    assert.equal(statSync(file).mode & 0o777, 0o644, `${file} must stay world-readable`);
  }
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
