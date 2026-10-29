import test from "node:test";
import assert from "node:assert/strict";

import plugin from "../dist/index.js";
import { normalizeOptions } from "../dist/options.js";
import { createV1Hooks } from "../dist/v1.js";

function config(overrides = {}) {
  return normalizeOptions({ text: "resume", ...overrides }, {});
}

function client(overrides = {}) {
  const calls = { promptAsync: [], prompt: [], log: [], get: [] };
  const api = {
    session: {
      promptAsync: async (input) => {
        calls.promptAsync.push(input);
      },
      get: async (input) => {
        calls.get.push(input);
        return { data: { id: input.path.id } };
      },
      ...overrides,
    },
  };
  const app = {
    log: async ({ body }) => {
      calls.log.push(body);
    },
  };
  return { hooks: createV1Hooks({ client: { ...api, app } }, config()), calls, api, app };
}

const compactionEvent = {
  event: { type: "session.compacted", properties: { sessionID: "s1" } },
};

test("ignores events other than session.compacted", async () => {
  const { hooks, calls } = client();
  await hooks.event({ event: { type: "session.idle", properties: { sessionID: "s1" } } });
  assert.equal(calls.promptAsync.length, 0);
});

test("injects the reminder through promptAsync", async () => {
  const { hooks, calls } = client();
  await hooks.event(compactionEvent);
  assert.deepEqual(calls.promptAsync, [
    { path: { id: "s1" }, body: { parts: [{ type: "text", text: "resume" }] } },
  ]);
});

test("falls back to session.prompt on older clients", async () => {
  const calls = { prompt: [] };
  const hooks = createV1Hooks(
    {
      client: {
        session: {
          prompt: async (input) => {
            calls.prompt.push(input);
          },
          get: async () => ({ data: {} }),
        },
      },
    },
    config(),
  );

  await hooks.event(compactionEvent);
  assert.equal(calls.prompt.length, 1);
  assert.equal(calls.prompt[0].body.parts[0].text, "resume");
});

test("a transport failure is logged, not thrown", async () => {
  const logs = [];
  const hooks = createV1Hooks(
    {
      client: {
        app: {
          log: async ({ body }) => {
            logs.push(body);
          },
        },
        session: {
          promptAsync: async () => {
            throw new Error("socket closed");
          },
          get: async () => ({ data: {} }),
        },
      },
    },
    config(),
  );

  await assert.doesNotReject(() => hooks.event(compactionEvent));
  assert.ok(logs.some((entry) => entry.level === "error"));
});

test("child sessions are skipped", async () => {
  const { hooks, calls } = client({
    get: async () => ({ data: { id: "child", parentID: "parent" } }),
  });
  await hooks.event(compactionEvent);
  assert.equal(calls.promptAsync.length, 0);
});

test("auto-continue is kept by default", async () => {
  const { hooks, calls } = client();
  const output = { enabled: true };
  await hooks["experimental.compaction.autocontinue"]({ sessionID: "s1" }, output);
  assert.equal(output.enabled, true);
  assert.equal(calls.get.length, 0);
});

test("auto-continue is suppressed when configured", async () => {
  const hooks = createV1Hooks(
    {
      client: {
        session: {
          promptAsync: async () => {},
          get: async () => ({ data: {} }),
        },
      },
    },
    config({ suppressBuiltinAutoContinue: true }),
  );
  const output = { enabled: true };
  await hooks["experimental.compaction.autocontinue"]({ sessionID: "s1" }, output);
  assert.equal(output.enabled, false);
});

test("auto-continue is kept for child sessions when they are excluded", async () => {
  const hooks = createV1Hooks(
    {
      client: {
        session: {
          promptAsync: async () => {},
          get: async () => ({ data: { id: "child", parentID: "parent" } }),
        },
      },
    },
    config({ suppressBuiltinAutoContinue: true }),
  );
  const output = { enabled: true };
  await hooks["experimental.compaction.autocontinue"]({ sessionID: "child" }, output);
  assert.equal(output.enabled, true);
});

test("auto-continue is kept when the parent probe fails", async () => {
  const hooks = createV1Hooks(
    {
      client: {
        session: {
          promptAsync: async () => {},
          get: async () => {
            throw new Error("not found");
          },
        },
      },
    },
    config({ suppressBuiltinAutoContinue: true }),
  );
  const output = { enabled: true };
  await hooks["experimental.compaction.autocontinue"]({ sessionID: "s1" }, output);
  assert.equal(output.enabled, true);
});

test("hybrid default export exposes id, setup and server", () => {
  assert.equal(plugin.id, "opencode-compact-resume");
  assert.equal(typeof plugin.setup, "function");
  assert.equal(typeof plugin.server, "function");
});

test("server() accepts v1 tuple options", async () => {
  const calls = [];
  const hooks = await plugin.server(
    {
      client: {
        session: {
          promptAsync: async (input) => {
            calls.push(input);
          },
        },
      },
    },
    { text: "custom reminder" },
  );

  await hooks.event(compactionEvent);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.parts[0].text, "custom reminder");
});

test("server() rejects an invalid v1 context", async () => {
  await assert.rejects(() => plugin.server({}), /invalid OpenCode v1 plugin context/);
  await assert.rejects(() => plugin.server(undefined), /invalid OpenCode v1 plugin context/);
});
