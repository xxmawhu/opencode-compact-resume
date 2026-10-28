import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_TEXT } from "../dist/constants.js";
import { setupV2, V2_COMPACTION_ENDED } from "../dist/v2.js";

function waitFor(predicate, timeoutMs = 1000) {
  const started = Date.now();
  return (async () => {
    while (Date.now() - started < timeoutMs) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("timed out waiting for condition");
  })();
}

function waitForAbort(signal) {
  if (!signal || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
}

function eventStream(events, signal) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        if (signal?.aborted) return;
        yield event;
      }
      await waitForAbort(signal);
    },
  };
}

function makeContext({
  options = {},
  events = [],
  sessions = {},
  withSynthetic = true,
  withPrompt = false,
} = {}) {
  const calls = { synthetic: [], prompt: [], subscribe: [] };
  const session = {
    get: async ({ sessionID }) => sessions[sessionID] ?? { id: sessionID },
  };
  if (withSynthetic) {
    session.synthetic = async (input) => {
      calls.synthetic.push(input);
    };
  }
  if (withPrompt) {
    session.prompt = async (input) => {
      calls.prompt.push(input);
    };
  }
  const ctx = {
    options,
    session,
    event: {
      subscribe: (subscribeOptions) => {
        calls.subscribe.push(subscribeOptions);
        return eventStream(events, subscribeOptions.signal);
      },
    },
  };
  return { ctx, calls };
}

const compaction = (sessionID) => ({ type: V2_COMPACTION_ENDED, data: { sessionID } });

test("subscribes to compaction.ended and injects a synthetic reminder", async () => {
  const { ctx, calls } = makeContext({ events: [compaction("s1")] });
  const cleanup = await setupV2(ctx);
  try {
    await waitFor(() => calls.synthetic.length === 1);
    assert.deepEqual(calls.subscribe[0].types, [V2_COMPACTION_ENDED]);
    assert.equal(calls.synthetic[0].sessionID, "s1");
    assert.equal(calls.synthetic[0].text, DEFAULT_TEXT);
    assert.equal(calls.synthetic[0].description, "opencode-compact-resume");
  } finally {
    cleanup();
  }
  assert.equal(calls.subscribe[0].signal.aborted, true);
});

test("options customize the injected text", async () => {
  const { ctx, calls } = makeContext({
    options: { text: "keep going", cooldownMs: 0 },
    events: [compaction("s1")],
  });
  const cleanup = await setupV2(ctx);
  try {
    await waitFor(() => calls.synthetic.length === 1);
    assert.equal(calls.synthetic[0].text, "keep going");
  } finally {
    cleanup();
  }
});

test("unrelated events are ignored", async () => {
  const { ctx, calls } = makeContext({
    options: { cooldownMs: 0 },
    events: [
      { type: "session.idle", data: { sessionID: "s1" } },
      compaction("s1"),
      { type: "session.status", data: { sessionID: "s1" } },
    ],
  });
  const cleanup = await setupV2(ctx);
  try {
    await waitFor(() => calls.synthetic.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(calls.synthetic.length, 1);
  } finally {
    cleanup();
  }
});

test("duplicate compaction events inject once per cooldown window", async () => {
  const { ctx, calls } = makeContext({ events: [compaction("s1"), compaction("s1")] });
  const cleanup = await setupV2(ctx);
  try {
    await waitFor(() => calls.synthetic.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(calls.synthetic.length, 1);
  } finally {
    cleanup();
  }
});

test("child sessions are skipped", async () => {
  const { ctx, calls } = makeContext({
    options: { cooldownMs: 0 },
    sessions: { child: { id: "child", parentID: "parent" } },
    events: [compaction("child"), compaction("s1")],
  });
  const cleanup = await setupV2(ctx);
  try {
    await waitFor(() => calls.synthetic.length === 1);
    assert.equal(calls.synthetic[0].sessionID, "s1");
  } finally {
    cleanup();
  }
});

test("falls back to session.prompt when synthetic is unavailable", async () => {
  const { ctx, calls } = makeContext({
    options: { cooldownMs: 0 },
    withSynthetic: false,
    withPrompt: true,
    events: [compaction("s1")],
  });
  const cleanup = await setupV2(ctx);
  try {
    await waitFor(() => calls.prompt.length === 1);
    assert.equal(calls.prompt[0].sessionID, "s1");
    assert.equal(calls.prompt[0].text, DEFAULT_TEXT);
  } finally {
    cleanup();
  }
});

test("missing transports are logged and do not crash the subscription", async () => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => {
    errors.push(args.join(" "));
  };
  try {
    const { ctx, calls } = makeContext({
      options: { cooldownMs: 0 },
      withSynthetic: false,
      events: [compaction("s1")],
    });
    const cleanup = await setupV2(ctx);
    try {
      await waitFor(() => errors.some((line) => line.includes("failed to inject")));
      assert.equal(calls.synthetic.length, 0);
    } finally {
      cleanup();
    }
  } finally {
    console.error = original;
  }
});

test("disabled plugin does not subscribe", async () => {
  const { ctx, calls } = makeContext({ options: { enabled: false } });
  const cleanup = await setupV2(ctx);
  cleanup();
  assert.equal(calls.subscribe.length, 0);
});
