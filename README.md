# opencode-compact-resume

An OpenCode plugin for both **OpenCode v1** and **OpenCode v2**. After a session compacts its context, it injects a short reminder so the agent checks for unfinished work (issues, pending plan items, session context and memory todos) and continues instead of stopping.

Context compaction keeps the summary and drops the details. Without a nudge, the agent often ends the turn right after compaction, losing track of the task it was executing. This plugin sends one reminder per compaction and stays out of the way otherwise.

Audience: OpenCode users who install the plugin, and maintainers who build it from source.

## How it works

| Host        | Trigger                          | Delivery                                              |
| ----------- | -------------------------------- | ----------------------------------------------------- |
| OpenCode v1 | `session.compacted` event        | `client.session.promptAsync` (falls back to `prompt`) |
| OpenCode v2 | `session.compaction.ended` event | `ctx.session.synthetic` (falls back to `prompt`)      |

Both entrypoints share the same injection core:

- **One reminder per compaction** — duplicate events and overlapping calls for the same session are dropped.
- **Cooldown** — a second reminder for the same session is skipped for 15 seconds by default.
- **Child sessions are skipped** — subagents are orchestrated by the parent session; set `includeChildSessions` to change this.
- **Failures never break the session** — a failed delivery is logged (warning/error only) and can be retried by the next event.
- **No runtime dependencies** — the package ships plain ESM and only uses the host APIs.

## Install

OpenCode installs the plugin from its own config. A manual `npm install` is not part of the host flow.

### From git (available now)

The host accepts npm git specifiers. Use the bare URL, which works in both host lines:

```text
git+https://gitee.com/SIZXSN6/recover-task-after-compact.git
```

Pin a revision or tag when reproducibility matters: append `#<commit>` or `#v0.1.0`.

`dist/` is not committed. The package declares `prepare`, so npm installs the dev dependencies of a git dependency and builds the package before linking it. The install needs network access to the repository and the npm registry, plus Node 18.18 or newer.

### OpenCode v2

`opencode.jsonc`:

```jsonc
{
  "plugins": ["git+https://gitee.com/SIZXSN6/recover-task-after-compact.git"],
}
```

The CLI can install it and write the config entry:

```sh
opencode plugin add git+https://gitee.com/SIZXSN6/recover-task-after-compact.git
```

With options:

```jsonc
{
  "plugins": [
    {
      "package": "git+https://gitee.com/SIZXSN6/recover-task-after-compact.git",
      "options": { "text": "Continue the unfinished task." },
    },
  ],
}
```

In v2 keep the specifier bare. The host splits `name@version` at the last `@`, so `name@git+https://…` is read as `name` plus a version and falls back to the registry.

### OpenCode v1 (>= 1.18.29)

v1 object entrypoints (`server()`) require OpenCode `1.18.29` or newer. On older v1 releases, use an older release line of this plugin or load it as a local plugin written in the classic function form.

`opencode.json`:

```jsonc
{
  "plugin": ["git+https://gitee.com/SIZXSN6/recover-task-after-compact.git"],
}
```

v1 also accepts the `opencode-compact-resume@git+https://…` form: both are parsed by npm's specifier parser.

With options (tuple form):

```jsonc
{
  "plugin": [
    [
      "git+https://gitee.com/SIZXSN6/recover-task-after-compact.git",
      { "text": "Continue the unfinished task." },
    ],
  ],
}
```

### From the npm registry

Registry publication is pending; the package name is not yet resolvable from the public registry. Once released, use `"plugins": ["opencode-compact-resume"]` in v2 or `"plugin": ["opencode-compact-resume"]` in v1.

## Verify the install

1. v2: run `opencode plugin list` and confirm `opencode-compact-resume` is listed. v1: check the server log for plugin load errors.
2. Trigger a compaction in any session.
3. The session receives the reminder once. A second compaction inside the cooldown window is skipped by design.

## Options

| Option                        | Type      | Default           | Description                                                            |
| ----------------------------- | --------- | ----------------- | ---------------------------------------------------------------------- |
| `enabled`                     | `boolean` | `true`            | Master switch.                                                         |
| `text`                        | `string`  | built-in reminder | Text injected after compaction. Empty or blank values use the default. |
| `cooldownMs`                  | `number`  | `15000`           | Minimum interval between two reminders in the same session.            |
| `includeChildSessions`        | `boolean` | `false`           | Also inject into child (subagent) sessions.                            |
| `suppressBuiltinAutoContinue` | `boolean` | `false`           | v1 only: disable OpenCode's generic auto-continue turn.                |
| `verbose`                     | `boolean` | `false`           | Also log info/debug lines; warnings and errors are always logged.      |

Defaults need no configuration: one reminder, no interference with subagents, and the host's own auto-continue kept as a safety net.

The default text is:

```text
请检查是否未完成的任务，如果有则继续工作。所谓的任务包含：issues,plan的待执行规划以及上下文和memory系统里的待做项。
```

## Environment variables

Environment variables are the only configuration channel available when a v1 host cannot pass options, and are useful for local testing. Explicit options always win over the environment.

| Variable                                                 | Maps to                       |
| -------------------------------------------------------- | ----------------------------- |
| `OPENCODE_COMPACT_RESUME_DISABLED`                       | `enabled` (inverted)          |
| `OPENCODE_COMPACT_RESUME_TEXT`                           | `text`                        |
| `OPENCODE_COMPACT_RESUME_COOLDOWN_MS`                    | `cooldownMs`                  |
| `OPENCODE_COMPACT_RESUME_INCLUDE_CHILD_SESSIONS`         | `includeChildSessions`        |
| `OPENCODE_COMPACT_RESUME_SUPPRESS_BUILTIN_AUTO_CONTINUE` | `suppressBuiltinAutoContinue` |
| `OPENCODE_COMPACT_RESUME_VERBOSE`                        | `verbose`                     |

Boolean values accept `true/false`, `1/0`, `yes/no` and `on/off` (case-insensitive).

## When to enable `suppressBuiltinAutoContinue`

OpenCode v1 adds a generic synthetic "continue" turn after compaction. If that turn already resumes your session, leave this option off (default) and the custom reminder is added on top.

Turn it on when you want exactly one continuation turn driven by the reminder text. The built-in turn is still kept for child sessions and when the parent lookup fails, so a session is never left without a continuation.

## Troubleshooting

- **No reminder after compaction.** Check that `OPENCODE_COMPACT_RESUME_DISABLED` is unset, the session is not a child session, and v1 is 1.18.29 or newer.
- **Git install fails in v2.** The specifier likely starts with `name@`. v2 splits at the last `@` and then installs from the registry; use the bare `git+https://…` URL.
- **Git install fails in both hosts.** The clone needs anonymous access to the repository, and the build needs the npm registry for dev dependencies. Check the host log for the `Failed to install plugin` line.
- **Reminder text is not applied.** v1 needs tuple options or the environment variable; v2 reads the `options` field at plugin load.
- **Two reminders in one session.** The host emitted duplicate events; the 15 s cooldown is per session, raise `cooldownMs`.
- **Delivery errors in the log.** Set `verbose` to see info lines; warnings and errors carry the session id and the transport error.

## Development

Development needs Node 18.18 or newer for the build and tests. The lint stack warns about unsupported engines on Node 18; Node 20.19 or newer removes those warnings.

```sh
npm install
npm run check        # lint + typecheck + build + tests
npm run build        # emit dist/
npm test             # build then run node:test against dist/
```

Layout:

```text
src/constants.ts   plugin id, default text, cooldown
src/options.ts     option/environment normalization
src/injector.ts    shared injection core (dedupe, cooldown, child sessions, errors)
src/v1.ts          v1 hooks (event, experimental.compaction.autocontinue)
src/v2.ts          v2 server part (event subscription, synthetic injection)
src/index.ts       hybrid entrypoint (default export with setup + server)
tests/             node:test suites against the built output
```

## Compatibility

| Host                  | Entrypoint | Status      |
| --------------------- | ---------- | ----------- |
| OpenCode v1 ≥ 1.18.29 | `server()` | supported   |
| OpenCode v1 < 1.18.29 | —          | unsupported |
| OpenCode v2           | `setup()`  | supported   |

## License

MIT
