# opencode-compact-resume

同时支持 **OpenCode v1** 与 **OpenCode v2** 的插件。会话压缩上下文后注入一条简短提醒，让 agent 先检查未完成的任务（issues、plan 待执行项、会话上下文与 memory 待办），再决定继续还是收尾。

上下文压缩只保留摘要、丢弃细节。没有提醒时，agent 常在压缩后直接结束回合，丢掉正在执行的任务。本插件每次压缩只发一条提醒，其余时间不介入。

读者：安装插件的 OpenCode 用户，以及从源码构建的维护者。

## 工作方式

| 宿主        | 触发                            | 投递                                              |
| ----------- | ------------------------------- | ------------------------------------------------- |
| OpenCode v1 | `session.compacted` 事件        | `client.session.promptAsync`（失败回退 `prompt`） |
| OpenCode v2 | `session.compaction.ended` 事件 | `ctx.session.synthetic`（失败回退 `prompt`）      |

两个入口共用同一套注入内核：

- **每次压缩注入一次** —— 每个压缩完成事件发出一条提醒；同一次事件的并发重复调用被丢弃。
- **投递被拒重试一次** —— 拒绝后等 1 秒重试一次；重试和最终失败都写入默认日志（warn/error，无需开启 `verbose`），失败后由下一次压缩事件重新尝试。
- **跳过子会话** —— 子代理由父会话编排；需要时用 `includeChildSessions` 打开。
- **失败不影响会话** —— 插件钩子从不向宿主抛错。
- **无运行时依赖** —— 只发布纯 ESM，只使用宿主 API。

## 安装

三步：从 git 安装、在 OpenCode 配置中引用、重启宿主。

### 1. 从 git 安装

需要 Node 18.18 以上，并可访问 GitHub。`dist/` 不入库；包声明了 `prepare`，安装时会自动构建。

```sh
npm install 'git+https://github.com/xxmawhu/opencode-compact-resume.git#v0.1.1'
```

用 `#<tag>` 或 `#<commit>` 固定版本；不加后缀时 npm 跟随默认分支。

仓库是唯一发布源。

### 2. 配置 OpenCode

#### OpenCode v2

`opencode.jsonc`：

```jsonc
{
  "plugins": ["git+https://github.com/xxmawhu/opencode-compact-resume.git#v0.1.1"],
}
```

或由 CLI 写入该条目：

```sh
opencode plugin add git+https://github.com/xxmawhu/opencode-compact-resume.git
```

带选项：

```jsonc
{
  "plugins": [
    {
      "package": "git+https://github.com/xxmawhu/opencode-compact-resume.git#v0.1.1",
      "options": { "text": "继续未完成的任务。" },
    },
  ],
}
```

v2 的说明符必须保持裸 URL。宿主按最后一个 `@` 切分 `name@version`，`name@git+https://…` 会被当作 `name` 加版本并回落到 registry；同理不要用 `git+ssh://git@github.com/…`。

#### OpenCode v1（>= 1.18.29）

v1 的对象入口（`server()`）需要 OpenCode `1.18.29` 及以上。更旧的 v1 版本请以经典函数形式作为本地插件加载。

`opencode.json`：

```jsonc
{
  "plugin": ["git+https://github.com/xxmawhu/opencode-compact-resume.git#v0.1.1"],
}
```

带选项（元组形式）：

```jsonc
{
  "plugin": [
    [
      "git+https://github.com/xxmawhu/opencode-compact-resume.git#v0.1.1",
      { "text": "继续未完成的任务。" },
    ],
  ],
}
```

### 3. 重启宿主

插件在启动时加载，修改配置后需要重启 OpenCode。

## 验证安装

1. v2 执行 `opencode plugin list`，确认列表中有 `opencode-compact-resume`；v1 检查服务日志有无插件加载错误。
2. 在任意会话触发一次压缩。
3. 会话收到一次提醒。

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
请检查是否未完成的任务，如果有则继续工作。所谓的任务包含：issues,plan的待执行规划以及上下文和memory系统里的待做项。
```

## 环境变量

v1 宿主无法传选项时，环境变量是唯一配置通道；本地测试也常用。显式选项优先级高于环境变量。

| 变量                                                     | 对应选项                      |
| -------------------------------------------------------- | ----------------------------- |
| `OPENCODE_COMPACT_RESUME_DISABLED`                       | `enabled`（取反）             |
| `OPENCODE_COMPACT_RESUME_TEXT`                           | `text`                        |
| `OPENCODE_COMPACT_RESUME_SUPPRESS_BUILTIN_AUTO_CONTINUE` | `suppressBuiltinAutoContinue` |
| `OPENCODE_COMPACT_RESUME_VERBOSE`                        | `verbose`                     |

布尔值接受 `true/false`、`1/0`、`yes/no`、`on/off`（不区分大小写）。

## 何时开启 `suppressBuiltinAutoContinue`

OpenCode v1 在压缩后追加一个通用的合成“继续”回合。若该回合已能让会话继续，保持此选项关闭（默认），自定义提醒叠加其上。

只有在希望由提醒文案驱动唯一一次续接时才开启。内置回合仍保留给子会话以及父会话查找失败的情况，会话不会失去续接。

## 排障

- **压缩后没有提醒**：确认未设置 `OPENCODE_COMPACT_RESUME_DISABLED`、会话不是子会话、v1 版本不低于 1.18.29。
- **v2 安装失败**：说明符可能以 `name@` 开头。v2 按最后一个 `@` 切分后会尝试从 registry 安装；改用裸 `git+https://…`。
- **两个宿主都装不上**：克隆需要仓库匿名可访问，构建需要 npm registry 提供开发依赖；查看宿主日志中的 `Failed to install plugin`。
- **提醒文案没生效**：v1 需使用元组选项或环境变量；v2 在插件加载时读取 `options` 字段。
- **同一会话收到两条提醒**：插件被注册了两次，或宿主重复派发同一压缩事件；确认插件只注册一次。
- **日志里有投递错误**：warning 与 error 默认就写日志，带上会话 id、尝试次数与完整错误对象（v1 的真实原因常在 `data.message`，`message` 只剩 `UnknownError`）；`verbose` 才记录 info/debug。
- **v1 压缩后仍未续跑**：`prompt_async` 可能返回 204 却不调度回合，客户端无法检测；检查是否同时运行多个 OpenCode 实例抢答同一会话，并保留宿主的自动续接作为兜底。

## 开发

开发需要 Node 18.18 以上用于构建与测试。Node 18 上 lint 栈会提示引擎不支持；升到 Node 20.19 以上可消除提示。

```sh
npm install
npm run check        # lint + typecheck + 构建 + 测试
npm run build        # 输出 dist/
npm test             # 先构建，再用 node:test 跑 dist/
```

目录：

```text
src/constants.ts   插件 id、默认文案
src/options.ts     选项与环境变量归一化
src/injector.ts    共用注入内核（并发去重、重试、子会话、错误）
src/v1.ts          v1 钩子（event、experimental.compaction.autocontinue）
src/v2.ts          v2 服务端部分（事件订阅、合成注入）
src/index.ts       混合入口（默认导出含 setup 与 server）
tests/             针对构建产物运行 node:test 套件
```

## 发布

tag 即发布。用户用 `...#v0.1.1` 固定版本，安装时由 `prepare` 构建 `dist/`。

```sh
git tag v0.1.2
git push origin v0.1.2
```
