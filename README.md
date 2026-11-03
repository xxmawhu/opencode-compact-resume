# opencode-compact-resume

同时支持 **OpenCode v1** 与 **OpenCode v2** 的插件。会话压缩上下文后注入一条简短提醒，让 agent 先检查未完成的任务（issues、plan 待执行项、会话上下文与 memory 待办），再决定继续还是收尾。

上下文压缩只保留摘要、丢弃细节。没有提醒时，agent 常在压缩后直接结束回合，丢掉正在执行的任务。本插件每次压缩只发一条提醒，其余时间不介入。

读者：安装并使用插件的 OpenCode 用户。

## 工作方式

| 宿主        | 触发                            | 投递                                       |
| ----------- | ------------------------------- | ------------------------------------------ |
| OpenCode v1 | `session.compacted` 事件        | `client.session.promptAsync`（缺失时回退） |
| OpenCode v2 | `session.compaction.ended` 事件 | `ctx.session.synthetic`（缺失时回退）      |

两个入口共用同一套注入内核：

- **每次压缩注入一次** —— 每个压缩完成事件发出一条提醒；同一次事件的并发重复调用被丢弃。
- **投递被拒重试一次** —— 拒绝后等 1 秒重试一次；重试和最终失败都写入默认日志（warn/error，无需开启 `verbose`），失败后由下一次压缩事件重新尝试。
- **跳过子会话** —— 子代理由父会话编排；需要时用 `includeChildSessions` 打开。
- **失败不影响会话** —— 插件钩子从不向宿主抛错。
- **无运行时依赖** —— 只发布纯 ESM，只使用宿主 API。

## 维护原则

1. **提示词不足时按证据改提示词。** 压缩后的提醒是本插件唯一的功能输出。若观察到压缩后会话没有继续任务、找错位置或输出空闲汇报，先固定证据（会话记录、插件日志、宿主规则），再修改 `DEFAULT_TEXT` 或文档，并在提交信息里写明证据。禁止凭感觉改文案。
2. **运行故障时修逻辑 bug。** 注入失败、重复注入、加载失败等故障先定位逻辑（宿主契约、并发、重试、路径），补复现用例后修复。不得用改提示词、加日志或放宽容错掩盖逻辑缺陷。

当前默认文案的依据：压缩只保留摘要，规则本身会丢失，故先要求重新读取 `memory/root.md` 与 `AGENTS.md`；未完成项有确定位置（`memory/long-plan.md` 的 `- [ ]`、`plan/`、`issues/`），比旧文案的「memory 系统里的待做项」可执行；旧文案未说明无待办时怎么做，容易触发空闲汇报。

## 安装

标准安装方式是把仓库里已构建好的插件文件复制到 OpenCode 配置目录。不构建、不联网、不改配置文件。

```sh
git clone git@github.com:xxmawhu/opencode-compact-resume.git
cd opencode-compact-resume
bash install.sh
```

| 目标路径                                     | 作用                          |
| -------------------------------------------- | ----------------------------- |
| `<config>/plugin/opencode-compact-resume.ts` | v1 本地插件入口               |
| `<config>/plugin/opencode-compact-resume/`   | 编译后的模块与 `package.json` |

`<config>` 默认 `${XDG_CONFIG_HOME:-$HOME/.config}/opencode`，可用 `OPENCODE_CONFIG_DIR` 覆盖：

```sh
OPENCODE_CONFIG_DIR=/path/to/opencode bash install.sh
```

更新：`git pull && bash install.sh`；卸载：`bash install.sh --uninstall`。脚本只复制文件，重复执行覆盖旧副本。`dist/` 随后续提交更新；改动源码后先 `npm ci && npm run build` 再提交。

升级必须重跑 `install.sh`：`git pull` 只更新仓库，已安装副本不会被改写。旧版安装器留下的模块目录可能是 `2700`，重跑后才会变成可穿越的目录。

安装产物固定为目录 `0755`、文件 `0644`。OpenCode 可能以另一个账号运行（运行账号 ≠ 执行 `install.sh` 的账号），目录不可穿越时 `import` 会在插件加载前失败，压缩后就不会有注入且没有插件日志。脚本在安装末尾校验这两项，不满足即报错退出。

安装后可用只读自检确认宿主可读：

```sh
bash install.sh --verify
```

输出包含配置目录属主、当前账号、每个产物的模式与 `.install-info` 标记；失败非 0 退出。

若曾用下面的宿主原生方式注册过本插件，先删掉 `opencode.json` 里的条目再运行 `install.sh`，否则同一次压缩会注入两条提醒。安装脚本发现残留注册会打印 warning。

### 备选：宿主原生安装

#### OpenCode v2

```sh
opencode plugin add git+https://github.com/xxmawhu/opencode-compact-resume.git
```

`plugin add` 负责安装并写入配置，跟随默认分支取最新版本，安装由宿主完成。需要自定义选项时改 `opencode.jsonc`：

```jsonc
{
  "plugins": [
    {
      "package": "git+https://github.com/xxmawhu/opencode-compact-resume.git",
      "options": { "text": "继续未完成的任务。" },
    },
  ],
}
```

说明符必须保持裸 URL。宿主按最后一个 `@` 切分 `name@version`，`name@git+https://…` 会被当作 `name` 加版本并回落到 registry；同理不要用 `git+ssh://git@github.com/…`。

#### OpenCode v1（>= 1.18.29）

v1 的对象入口（`server()`）需要 OpenCode `1.18.29` 及以上。更旧的 v1 请以经典函数形式作为本地插件加载。

`opencode.json`：

```jsonc
{
  "plugin": ["git+https://github.com/xxmawhu/opencode-compact-resume.git"],
}
```

宿主启动时自动安装。带选项用元组形式：

```jsonc
{
  "plugin": [
    [
      "git+https://github.com/xxmawhu/opencode-compact-resume.git",
      { "text": "继续未完成的任务。" },
    ],
  ],
}
```

### 重启宿主

插件在启动时加载，修改配置后重启 OpenCode。之后取最新：v2 用 `opencode plugin update`，v1 重新安装或重启宿主。

## 验证安装

1. `bash install.sh --verify` 退出码为 0，且副本目录显示 `drwxr-xr-x`（或带 setgid 的 `drwxr-sr-x`）。
2. 复制安装：`opencode debug info` 的 `plugins:` 列表包含 `<config>/plugin/opencode-compact-resume.ts`。宿主原生安装：v2 执行 `opencode plugin list`，v1 检查服务日志有无插件加载错误。
3. 在任意会话触发一次压缩。
4. 会话收到一次提醒。

## 选项

| 选项                          | 类型      | 默认值   | 说明                                                 |
| ----------------------------- | --------- | -------- | ---------------------------------------------------- |
| `enabled`                     | `boolean` | `true`   | 总开关。                                             |
| `text`                        | `string`  | 内置提醒 | 压缩后注入的文案；空值或空白使用默认文案。           |
| `includeChildSessions`        | `boolean` | `false`  | 是否也向子会话（子代理）注入。                       |
| `suppressBuiltinAutoContinue` | `boolean` | `false`  | 仅 v1：关闭宿主自带的通用自动续接回合。              |
| `verbose`                     | `boolean` | `false`  | 是否额外记录 info/debug；warning 与 error 始终记录。 |

默认值无需配置：每次压缩一条提醒、不干预子会话、保留宿主自带的自动续接作为兜底。

默认文案：

```text
压缩完成，细节可能已丢失。请先重新读取 memory/root.md（最高准则）与 AGENTS.md（规则），再检查未完成任务：memory/long-plan.md 的未勾选项、plan/ 的待执行项、issues/ 的未处理项，以及当前上下文里的待办。有则继续执行；没有则保持静默，不要输出空闲汇报。
```

## 环境变量

v1 宿主无法传选项时，环境变量是唯一配置通道；本地测试也常用。显式选项优先级高于环境变量。

| 变量                                                     | 对应选项                      |
| -------------------------------------------------------- | ----------------------------- |
| `OPENCODE_COMPACT_RESUME_DISABLED`                       | `enabled`（取反）             |
| `OPENCODE_COMPACT_RESUME_TEXT`                           | `text`                        |
| `OPENCODE_COMPACT_RESUME_INCLUDE_CHILD_SESSIONS`         | `includeChildSessions`        |
| `OPENCODE_COMPACT_RESUME_SUPPRESS_BUILTIN_AUTO_CONTINUE` | `suppressBuiltinAutoContinue` |
| `OPENCODE_COMPACT_RESUME_VERBOSE`                        | `verbose`                     |

布尔值接受 `true/false`、`1/0`、`yes/no`、`on/off`（不区分大小写）。

## 何时开启 `suppressBuiltinAutoContinue`

OpenCode v1 在压缩后追加一个通用的合成“继续”回合。若该回合已能让会话继续，保持此选项关闭（默认），自定义提醒叠加其上。

只有在希望由提醒文案驱动唯一一次续接时才开启。内置回合仍保留给子会话以及父会话查找失败的情况，会话不会失去续接。

## 排障

- **压缩后没有提醒**：先确认未设置 `OPENCODE_COMPACT_RESUME_DISABLED`、会话不是子会话、插件入口出现在 `opencode debug info` 的 `plugins:` 列表。
  再运行 `bash install.sh --verify`，非 0 退出时按输出修复；常见原因是模块目录对宿主账号不可穿越。
  缺少 `.install-info` 说明副本早于 0.1.5，重跑 `install.sh` 刷新。
  该故障没有插件日志，因为 `import` 在钩子注册前就失败。
- **v2 安装失败**：说明符可能以 `name@` 开头。v2 按最后一个 `@` 切分后会尝试从 registry 安装；改用裸 `git+https://…`。
- **两个宿主都装不上**：克隆需要仓库可访问；仓库自带 `dist/`，宿主安装不再需要构建依赖。查看宿主日志中的 `Failed to install plugin`。
- **提醒文案没生效**：v1 需使用元组选项或环境变量；v2 在插件加载时读取 `options` 字段。
- **同一会话收到两条提醒**：插件被注册了两次，或宿主重复派发同一压缩事件；确认插件只注册一次。
- **日志里有投递错误**：warning 与 error 默认就写日志，带上会话 id、尝试次数与完整错误对象（v1 的真实原因常在 `data.message`，`message` 只剩 `UnknownError`）；`verbose` 才记录 info/debug。
- **v1 压缩后仍未续跑**：`prompt_async` 可能返回 204 却不调度回合，客户端无法检测；检查是否同时运行多个 OpenCode 实例抢答同一会话，并保留宿主的自动续接作为兜底。

## 开发

```sh
NODE_ENV=development npm ci    # 安装开发依赖（本机默认 NODE_ENV=production，需显式指定）
npm run check                  # lint + 类型检查 + 测试（含 install.sh 用例）
npm run build                  # 重建 dist/
```

`dist/` 入库供 `install.sh` 直接复制；改完源码先构建再提交，避免仓库内副本过期。
