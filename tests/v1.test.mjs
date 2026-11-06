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

const compacted = (sessionID = "s1") => ({
  event: { type: "session.compacted", properties: { sessionID } },
});
const idle = (sessionID = "s1") => ({
  event: { type: "session.idle", properties: { sessionID } },
});
const statusIdle = (sessionID = "s1") => ({
  event: {
    type: "session.status",
    properties: { sessionID, status: { type: "idle" } },
  },
});
const statusBusy = (sessionID = "s1") => ({
  event: {
    type: "session.status",
    properties: { sessionID, status: { type: "busy" } },
  },
});

test("ignores events other than compaction and idle", async () => {
  const { hooks, calls } = client();
  await hooks.event({ event: { type: "message.updated", properties: { sessionID: "s1" } } });
  assert.equal(calls.promptAsync.length, 0);
});

test("compaction defers the reminder until the session is idle", async () => {
  const { hooks, calls } = client();
  await hooks.event(compacted());
  assert.equal(calls.promptAsync.length, 0);

  await hooks.event(idle());
  assert.deepEqual(calls.promptAsync, [
    { path: { id: "s1" }, body: { parts: [{ type: "text", text: "resume" }] } },
  ]);
});

test("session.status idle also releases a pending reminder", async () => {
  const { hooks, calls } = client();
  await hooks.event(compacted());
  await hooks.event(statusIdle());
  assert.equal(calls.promptAsync.length, 1);
});

test("a busy status does not release the reminder", async () => {
  const { hooks, calls } = client();
  await hooks.event(compacted());
  await hooks.event(statusBusy());
  assert.equal(calls.promptAsync.length, 0);

  await hooks.event(idle());
  assert.equal(calls.promptAsync.length, 1);
});

test("one idle transition delivers exactly once despite status+idle events", async () => {
  const { hooks, calls } = client();
  await hooks.event(compacted());
  await hooks.event(statusIdle());
  await hooks.event(idle());
  assert.equal(calls.promptAsync.length, 1);
});

test("idle without a pending compaction is ignored", async () => {
  const { hooks, calls } = client();
  await hooks.event(idle());
  assert.equal(calls.promptAsync.length, 0);
});

test("two compactions before idle coalesce into one reminder", async () => {
  const { hooks, calls } = client();
  await hooks.event(compacted());
  await hooks.event(compacted());
  await hooks.event(idle());
  assert.equal(calls.promptAsync.length, 1);
});

test("a later compaction delivers again", async () => {
  const { hooks, calls } = client();
  await hooks.event(compacted());
  await hooks.event(idle());
  await hooks.event(compacted());
  await hooks.event(idle());
  assert.equal(calls.promptAsync.length, 2);
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

  await hooks.event(compacted());
  assert.equal(calls.prompt.length, 0);
  await hooks.event(idle());
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

  await hooks.event(compacted());
  await assert.doesNotReject(() => hooks.event(idle()));
  assert.ok(logs.some((entry) => entry.level === "error"));
});

test("child sessions are skipped at delivery", async () => {
  const { hooks, calls } = client({
    get: async () => ({ data: { id: "child", parentID: "parent" } }),
  });
  await hooks.event(compacted());
  await hooks.event(idle());
  assert.equal(calls.promptAsync.length, 0);
});

test("disabled plugin schedules nothing", async () => {
  const calls = { promptAsync: [] };
  const hooks = createV1Hooks(
    {
      client: {
        session: {
          promptAsync: async (input) => {
            calls.promptAsync.push(input);
          },
        },
      },
    },
    config({ enabled: false }),
  );

  await hooks.event(compacted());
  await hooks.event(idle());
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

  await hooks.event(compacted());
  assert.equal(calls.length, 0);
  await hooks.event(idle());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.parts[0].text, "custom reminder");
});

test("server() rejects an invalid v1 context", async () => {
  await assert.rejects(() => plugin.server({}), /invalid OpenCode v1 plugin context/);
  await assert.rejects(() => plugin.server(undefined), /invalid OpenCode v1 plugin context/);
});
