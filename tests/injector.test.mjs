import test from "node:test";
import assert from "node:assert/strict";

import { createResumeInjector } from "../dist/injector.js";
import { normalizeOptions } from "../dist/options.js";

function baseConfig(overrides = {}) {
  return normalizeOptions({ text: "resume", ...overrides }, {});
}

function recorder(overrides = {}) {
  const sent = [];
  const calls = { childLookups: 0 };
  const deps = {
    send: async (sessionID, text) => {
      sent.push({ sessionID, text });
    },
    ...overrides,
  };
  return { sent, calls, deps };
}

test("each compaction event injects once", async () => {
  const { sent, deps } = recorder();
  const injector = createResumeInjector(baseConfig(), deps);

  assert.equal(await injector.handle("s1", "test"), true);
  assert.deepEqual(sent, [{ sessionID: "s1", text: "resume" }]);

  // A second event means a second compaction, which must inject again: there
  // is no time-based window that could swallow it.
  assert.equal(await injector.handle("s1", "test"), true);
  assert.equal(sent.length, 2);
});

test("sessions inject independently", async () => {
  const { sent, deps } = recorder();
  const injector = createResumeInjector(baseConfig(), deps);

  assert.equal(await injector.handle("a", "test"), true);
  assert.equal(await injector.handle("b", "test"), true);
  assert.deepEqual(
    sent.map((entry) => entry.sessionID),
    ["a", "b"],
  );
});

test("missing sessionID is ignored", async () => {
  const { sent, deps } = recorder();
  const injector = createResumeInjector(baseConfig(), deps);

  assert.equal(await injector.handle(undefined, "test"), false);
  assert.equal(sent.length, 0);
});

test("disabled plugin performs no work", async () => {
  const { sent, deps } = recorder();
  const injector = createResumeInjector(baseConfig({ enabled: false }), deps);

  assert.equal(await injector.handle("s1", "test"), false);
  assert.equal(sent.length, 0);
});

test("child sessions are skipped unless includeChildSessions is set", async () => {
  const { sent, deps } = recorder({ isChildSession: async () => true });
  const injector = createResumeInjector(baseConfig(), deps);

  assert.equal(await injector.handle("child", "test"), false);
  assert.equal(sent.length, 0);

  const permissive = createResumeInjector(baseConfig({ includeChildSessions: true }), deps);
  assert.equal(await permissive.handle("child", "test"), true);
  assert.equal(sent.length, 1);
});

test("a failing child probe does not block the reminder", async () => {
  const logs = [];
  const { sent, deps } = recorder({
    isChildSession: async () => {
      throw new Error("lookup failed");
    },
    log: (level, message) => logs.push({ level, message }),
  });
  const injector = createResumeInjector(baseConfig(), deps);

  assert.equal(await injector.handle("s1", "test"), true);
  assert.equal(sent.length, 1);
  assert.ok(logs.some((entry) => entry.level === "warn"));
});

test("a rejected send is retried and still injects exactly once", async () => {
  const logs = [];
  let attempts = 0;
  const sent = [];
  const injector = createResumeInjector(baseConfig(), {
    send: async (sessionID, text) => {
      attempts += 1;
      if (attempts === 1) throw new Error("transport down");
      sent.push({ sessionID, text });
    },
    log: (level) => logs.push(level),
  });

  assert.equal(await injector.handle("s1", "test"), true);
  assert.equal(attempts, 2);
  assert.equal(sent.length, 1);
  assert.ok(logs.includes("warn"));
});

test("gives up after the retry budget without recording the session", async () => {
  const logs = [];
  let attempts = 0;
  const injector = createResumeInjector(baseConfig(), {
    send: async () => {
      attempts += 1;
      throw new Error("transport down");
    },
    log: (level) => logs.push(level),
  });

  assert.equal(await injector.handle("s1", "test"), false);
  assert.equal(attempts, 3);
  assert.ok(logs.includes("error"));

  // Failure keeps no state, so the next compaction event tries again.
  assert.equal(await injector.handle("s1", "test"), false);
  assert.equal(attempts, 6);
});

test("a second call while the first is in flight is skipped", async () => {
  let resolveSend;
  let sends = 0;
  const injector = createResumeInjector(baseConfig(), {
    send: () => {
      sends += 1;
      return new Promise((resolve) => {
        resolveSend = resolve;
      });
    },
  });

  const first = injector.handle("s1", "test");
  const second = injector.handle("s1", "test");
  assert.equal(await second, false);

  resolveSend();
  assert.equal(await first, true);
  assert.equal(sends, 1);
});

test("injection never throws when the transport is missing", async () => {
  const injector = createResumeInjector(baseConfig(), {
    send: () => {
      throw new Error("sync transport failure");
    },
  });

  await assert.doesNotReject(() => injector.handle("s1", "test"));
  assert.equal(await injector.handle("s1", "test"), false);
});
