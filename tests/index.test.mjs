import test from "node:test";
import assert from "node:assert/strict";

import plugin from "../dist/index.js";

function captureConsole() {
  const lines = [];
  const originalError = console.error;
  const originalLog = console.log;
  console.error = (...args) => lines.push(args.join(" "));
  console.log = (...args) => lines.push(args.join(" "));
  return {
    lines,
    restore() {
      console.error = originalError;
      console.log = originalLog;
    },
  };
}

function classicV1Input(extraSession = {}) {
  return {
    directory: process.cwd(),
    worktree: process.cwd(),
    client: {
      session: { list: async () => [], ...extraSession },
      app: { log: async () => {} },
    },
  };
}

function v2Context({ subscribe, session = {} } = {}) {
  const calls = { subscribe: [] };
  const ctx = {
    session: {
      synthetic: async () => ({}),
      get: async () => ({ id: "s1" }),
      ...session,
    },
    event: {
      subscribe: (options) => {
        calls.subscribe.push(options);
        return (
          subscribe?.(options) ?? {
            [Symbol.asyncIterator]() {
              return { next: async () => ({ done: true, value: undefined }) };
            },
          }
        );
      },
    },
  };
  return { ctx, calls };
}

test("setup() with the classic v1 input stays inert without a subscribe error", async () => {
  const capture = captureConsole();
  let cleanup;
  try {
    cleanup = await plugin.setup(classicV1Input());
  } finally {
    capture.restore();
  }

  assert.equal(typeof cleanup, "function");
  cleanup();
  const log = capture.lines.join("\n");
  assert.match(log, /setup\(\) received .*v1.* input/);
  assert.doesNotMatch(log, /compaction event subscription failed/);
});

test("setup() with the classic v1 input and a send transport stays inert without a subscribe error", async () => {
  const capture = captureConsole();
  let cleanup;
  try {
    cleanup = await plugin.setup(classicV1Input({ promptAsync: async () => ({}) }));
  } finally {
    capture.restore();
  }

  assert.equal(typeof cleanup, "function");
  cleanup();
  const log = capture.lines.join("\n");
  assert.doesNotMatch(log, /compaction event subscription failed/);
});

test("setup() with a v2 context still subscribes to compaction events", async () => {
  const { ctx, calls } = v2Context();
  const cleanup = await plugin.setup(ctx);
  assert.equal(calls.subscribe.length, 1);
  assert.deepEqual(calls.subscribe[0].types, ["session.compaction.ended"]);
  cleanup();
  assert.equal(calls.subscribe[0].signal.aborted, true);
});

test("setup() with a v2 context missing event.subscribe stays inert", async () => {
  const capture = captureConsole();
  let cleanup;
  try {
    cleanup = await plugin.setup({ session: { synthetic: async () => ({}) } });
  } finally {
    capture.restore();
  }

  assert.equal(typeof cleanup, "function");
  cleanup();
  assert.match(capture.lines.join("\n"), /no event\.subscribe/);
});
