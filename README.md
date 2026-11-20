# LaTeX Studio

A project-level LaTeX workspace for DeepSeek Harness. Open a local or SSH
repository as **one project** instead of one file: build the whole paper,
preview the PDF in DSH's native viewer, and quote or annotate passages straight
into the chat — the annotation flow is modelled on Codex.

**English** | [中文](#中文)

```bash
dsh plugin --profile desktop add github:Beater-221E/latex-studio
```

---

## Why

Most LaTeX editors compile **the file you opened**. That falls apart for a real
paper: chapter files have no preamble, the bibliography never runs, `\ref`
stays `??`, and figures resolve against the wrong directory.

LaTeX Studio treats a repository as one project: it finds the main `.tex`,
builds in the project root (including `\input`, bibliography and multi-pass
cross-references), shows structured diagnostics, opens the PDF in DSH's native
viewer, and lets you select text there to insert a quote — or several annotated
passages at once — into the composer.

## Features

| Feature | What it does |
|---|---|
| Open any project folder | Local folder (OS dialog) or SSH host folder (in-app browser), **without changing the session workspace** |
| Project discovery | Scans one level for `.tex`, ranks `% !TEX root` and `\documentclass` candidates |
| Whole-project build | `pdflatex` / `xelatex` / `lualatex`; only the bibliography tool the `.aux` asks for; the last pass only when the log reports reruns |
| Skip unchanged | Reuses the existing PDF when no source is newer (“no changes, reused”) |
| Editor | Tree + source pane, `Ctrl+S` save, `Ctrl+Enter` compile |
| Diagnostics | `file:line: message`, missing `.sty`/`.bbl`, undefined references; click to jump |
| Preview | Publishes the build into the workspace and opens DSH's **native PDF.js** preview (selectable text, zoom) |
| Annotations | Codex-style: select text → quote / add to the annotation basket → insert all at once (see below) |
| Local or remote | Spawn locally, or SFTP + `sshPool` remotely, with `remoteWrapper` to hop into a pod |

## Quick start

1. Press **+** in the composer → **Open LaTeX project** (or use the Studio toolbar);
2. Pick *Local folder* or *SSH host*, browse, then **Open project**;
3. The Studio opens: file tree on the left, editor in the middle, main-file selector on top;
4. `Ctrl+S` saves, `Ctrl+Enter` compiles;
5. After a successful build press **Open PDF**; select text and use the floating **Quote** / **Annotate** actions.

## Tutorial

### 1. Opening a project

Two entry points: the composer's **+** menu and the Studio's **Open project /
Switch project**. The dialog offers:

- **Local folder** — opens the OS directory chooser on the DSH machine, or paste
  an absolute path, then **Open project**;
- **SSH host** — choose a host (from `dsh-ssh-toolkit`), press **List**, walk the
  remote tree, then **Open project**.

The session workspace is never changed: the project descriptor is stored per
session in localStorage and every RPC is routed to that folder. Previously
opened projects are remembered and prefilled.

### 2. Choosing the main file

1. A `% !TEX root = main.tex` comment wins outright;
2. Otherwise files with `\documentclass` are scored: the name `main` scores
   highest, `paper`/`ms`/`manuscript`/`thesis`/`report` score less; shallower
   directories, `\begin{document}`, `\title`, and `\input` add points;
3. With several project directories a **Project** dropdown appears first.

For a paper with `main.tex` plus `CameraReady2027.tex`, switch with the **Main
file** dropdown.

### 3. File tree

- Directories expand lazily (one request per level);
- The filter box narrows the current level;
- Type marks: `T` tex, `B` bib, `S` sty/cls/bst, `P` pdf, `I` image, `·` other;
- The open file is highlighted; the main file carries `MAIN`;
- `.tex` opens in the editor; **PDFs and images** open in DSH's native preview
  (the file is first copied to `.latex-studio-preview/<project-hash>/` inside
  the workspace);
- The `◧` button in the project bar collapses the tree.

### 4. Editing

One file at a time, with line numbers. `Ctrl+S` saves (only enabled when dirty),
`Ctrl+Enter` compiles. Switching files with unsaved changes asks for
confirmation.

### 5. Building

1. Runs `<engine> -interaction=nonstopmode -file-line-error -synctex=1 <main>`
   in the **project root**;
2. Reads `.aux` and runs either `biber` or `bibtex` — only the one needed;
3. If the log still reports `Rerun to get` / `Label(s) may have changed` /
   `There were undefined references`, runs one final pass;
4. The status bar reports `errors · warnings · pages · passes · time`.

Two speed-ups:

- **Skip unchanged** — one `find -newer` check; when every `.tex/.bib/.cls/.sty`
  is older than the PDF, TeX is skipped and “no changes, reused” is shown;
- **One remote round trip** — remote builds send the first pass, the
  bibliography tool and the follow-up passes as a single remote command.

### 6. Diagnostics

Errors (`file:line: message`, click to jump), collapsible warnings, missing
files, and a log tail toggle — all parsed from the TeX transcript.

### 7. PDF preview

**Open PDF** opens DSH's built-in document preview: a **native PDF.js viewer**
with a real text layer (text can be selected and copied, zoom works), not a
browser iframe. Because `dsh-resource://file/session/...` resolves against the
session workspace, the PDF is copied to
`.latex-studio-preview/<project-hash>/` first — so two projects with a
`main.pdf` never collide. The button only appears after a successful build.

### 8. Codex-style annotations (key feature)

Goal: mark **several passages** in the PDF, each with its own instruction, and
submit them together — like Codex's PDF annotations.

**Steps**

1. Build and open the PDF preview;
2. Drag-select text in the body; a floating bar appears:

   ```
   [ Quote ] [ Annotate ]
   ```

3. **Annotate** adds `#1 · p.3` (index + page) to a floating basket with a text
   box for “what should change here”;
4. Keep selecting and annotating: `#2 · p.5`, …;
5. **Insert all** turns every annotation into a quote node in the composer, in
   order:

   ```
   [annotation #1 · p.3] selected text…
   request: unify the notation to \bar{x}

   [annotation #2 · p.5] another passage…
   request: replace this figure with a reference plot
   ```

6. Add one summary sentence (“apply all three above”) and send.

**Quote vs Annotate**

| Action | Behaviour | When |
|---|---|---|
| **Quote** | Inserts the selection as one quote node immediately | One passage, one quick request |
| **Annotate** | Adds it to the basket with an index, page and per-item instruction | Several passages to submit together |

**Basket** — item count in the title, per-item text preview, instruction box,
`×` remove, **Clear**, **Insert all**. `×` in the corner only hides the panel.
The basket clears when you switch session or project.

**Shortcut** — `Ctrl+Shift+A` (`Cmd+Shift+A` on macOS) adds the current
selection to the basket without the mouse.

**How it works** — DSH's native preview renders pdf.js text layers, so the
selection is real text. The plugin listens for `selectionchange`, only reacts
inside `.textLayer`, and inserts through the composer's
`inputActions.insertQuote` (the same seam the official `message-quotes` plugin
uses). If a DSH build does not expose it, the text falls back to the clipboard.
Page numbers are inferred from the order of text layers in the preview.

**Compared with Codex**

| Codex annotation | LaTeX Studio |
|---|---|
| Select text → “Ask for changes” | Select text → **Quote** / **Annotate** |
| Numbered notes with screenshots | Numbered notes + page + text (**no screenshots yet**) |
| On-page anchor markers | Not available (the preview belongs to DSH) |
| Same process as the composer | Uses DSH's `insertQuote`; clipboard fallback |
| Submit many at once | **Yes** — basket → Insert all |

### 9. Switching projects

**Switch project…** reopens the dialog. Each project keeps its own preview copy
path, discovery cache and annotation basket. Re-opening a project renders from
cache immediately and refreshes in the background; **Rescan** forces a refresh.

### 10. Workspace vs project directory

A project can live **outside** the session workspace. That does not change the
agent's `bash/read` root — the agent's file tools still see only the workspace.
Preview and annotations use the plugin's own channel. If you want the agent to
edit the paper files directly, open the session at the paper directory instead.

## Remote builds (SSH / pod)

Remote projects reuse `dsh-ssh-toolkit`: files over SFTP, commands through
`sshPool`. When TeX lives in a pod behind the SSH host, use `remoteWrapper`:

```yaml
config:
  remoteWrapper: >-
    bash -c '. /etc/profile.d/dsmlp-login.sh;
    kubectl exec "$(cat ~/.dsmlp/current_pod)" -- bash -c
    "$(printf %s "$1" | sed "s#/dsmlp/home-fs03/<uid>/<gid>/<user>#/home/<user>#g")"' --
```

- The plugin passes the build script as one argument, so `--` and `"$1"` are
  required;
- `bash -c` (not `-l`) on both hops skips the login profiles and saves about
  2.5 s per command on this cluster;
- `sed` maps the login-node home path to the pod's;
- a fixed pod works too: `kubectl exec <pod> -- bash -c …`.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `engine` | `pdflatex` | Default engine for new projects (switchable in the toolbar) |
| `maxPasses` | `4` | Hard cap on TeX passes per build |
| `timeoutMs` | `180000` | Timeout of one process |
| `remoteWrapper` | empty | Prefix that runs the build script somewhere else |

## FAQ

**`pdflatex: command not found`** — the SSH target has no TeX. Configure
`remoteWrapper`, or use a local project.

**`workspace-file/not-found` when opening the PDF** — the preview copy failed;
the status bar now shows “could not publish the preview: <reason>”. Check that
the workspace is writable, rescan and build again.

**Text cannot be selected in the PDF** — make sure it is DSH's native preview
and the PDF has a text layer (scanned images do not).

**The floating bar does not appear** — select inside the text layer, and make
sure the DSH build exposes the composer interface; otherwise insertion falls
back to the clipboard.

**First open is slow** — the first scan reads file heads; later opens hit the
cache. Remote projects also pay connection setup once.

**Builds feel slow** — remote builds pay one environment hop per build; passes
are already batched and unchanged projects are skipped.

## Limits

- No SyncTeX, no live recompilation, no collaborative editing;
- Annotations are **text only** — region screenshots need a custom renderer and
  an attachment API DSH does not expose to plugins;
- An external project stays invisible to the agent's file tools;
- Discovery scans one level; open deeply nested monorepos at the paper folder;
- Missing TeX packages are reported as diagnostics; install them in the TeX
  distribution (e.g. `mpm --install=...` on MiKTeX).

## Development

```bash
npm test                                            # node --test tests/*.test.mjs
node scripts/service-smoke.mjs <project with main.tex>
```

```
index.js               Host entry: service + Typert binding
client.js              Browser half: tab, dialog, tree, editor, annotations
src/engine.js          Discovery ranking, log parsing
src/build.js           Build loop and batched remote script
src/host/service.js    RPC implementations and project routing
src/host/backends.js   local (fs/spawn) and remote (SFTP/sshPool) backends
src/host/paths.js      Remote workspace placeholder routing
src/host/typert.js     Wire contract
tests/                 Unit tests and the browser registration audit
scripts/service-smoke.mjs  Real-project smoke run
```

---

# 中文

一个给 DeepSeek Harness（DSH）用的**项目级 LaTeX 工作台**：把整个仓库当成一个工程打开、编辑、编译和预览，并在 PDF 预览里**选中文字直接引用/批注到对话**——批注流程参考了 Codex 的 annotation 交互。

支持**本地目录**和**远端 SSH 目录**；也支持宿主机没有 TeX、TeX 藏在 Kubernetes Pod 里的场景。

```bash
dsh plugin --profile desktop add github:Beater-221E/latex-studio
```

## 为什么需要它

常见的 LaTeX 编辑器会**只编译你打开的那个文件**。真实论文里这样不行：章节文件没有导言区、参考文献不会跑、`\ref` 一直是 `??`、图片路径按错误目录解析。

LaTeX Studio 把一个**仓库**当成一个项目：自动找主 `.tex`、在项目根目录编译整个工程（含 `\input`、参考文献、多遍交叉引用）、展示结构化诊断、用 DSH 原生 PDF 阅读器预览，并让你在 PDF 上选中文字，把「原文 + 修改要求」插入对话输入框。

## 功能一览

| 功能 | 说明 |
|---|---|
| 打开任意项目目录 | 本地文件夹（系统对话框）或 SSH 主机文件夹（内置浏览器），**不改会话工作区** |
| 项目发现 | 扫项目根一层的 `.tex`，按 `% !TEX root`、文件名、目录深度打分 |
| 项目级编译 | `pdflatex`/`xelatex`/`lualatex`；只跑 `.aux` 需要的 biber 或 bibtex；日志无 rerun 提示时省略最后一遍 |
| 无改动跳过 | 源码都不比 PDF 新时直接复用，显示「无改动，复用」 |
| 编辑器 | 文件树 + 源码编辑，`Ctrl+S` 保存，`Ctrl+Enter` 编译 |
| 诊断 | `file:line: message`、缺失 `.sty`/`.bbl`、未定义引用；点击跳行 |
| 预览 | 产物发布到工作区，用 DSH **原生 PDF.js** 预览（文字可选中、可缩放） |
| 批注 | 仿 Codex：选中 → 引用 / 加批注 → 多条一起插入对话 |
| 本地 / 远端 | 本地 spawn；远端 SFTP + `sshPool`，支持 `remoteWrapper` 跨进 Pod |

## 快速开始

1. 输入框左下角 **`+`** → **打开 LaTeX 项目**（或 Studio 工具栏）；
2. 选「本地文件夹」→ 浏览，或「SSH 主机」→ 选主机 → 浏览目录 → **打开项目**；
3. Studio 打开：左边文件树、中间编辑器，顶部选主文件；
4. `Ctrl+S` 保存，`Ctrl+Enter` 编译；
5. 编译成功后点 **打开 PDF**；选中文字后用浮动条**引用**或**加批注**。

## 详细教程

### 1. 打开 LaTeX 项目

入口：输入框 **`+`** 菜单里的 **打开 LaTeX 项目**；或 Studio 顶部 **打开项目 / 切换项目**。

- **本地文件夹**：点「浏览…」弹系统目录选择框，或直接粘绝对路径，然后 **打开项目**；
- **SSH 主机**：选主机（来自 `dsh-ssh-toolkit` 配置），点「列出」逐层进入目标目录，再 **打开项目**。

要点：**不会修改当前会话的工作区**。项目描述按「会话 + 项目」存在浏览器本地，所有读写和编译都路由到该目录；打开过的项目下次会自动带出来。

### 2. 选择主文件

1. 文件头有 `% !TEX root = main.tex` 注释 → 直接采用；
2. 否则按 `\documentclass` 打分：名字 `main` 最高，`paper`/`ms`/`manuscript`/`thesis`/`report` 次之；目录越浅、有 `\begin{document}`/`\title`/`\input` 都加分；
3. 多个目录各有入口时，顶部先出现 **项目** 下拉。

`main.tex` 和 `CameraReady2027.tex` 这类同目录多入口，用顶部 **主文件** 下拉切换。

### 3. 文件树

- 目录懒加载（展开才请求）；
- 顶部筛选框过滤当前层；
- 类型标记：`T` tex、`B` bib、`S` sty/cls/bst、`P` pdf、`I` 图片、`·` 其它；
- 当前文件高亮，主文件带 `MAIN`；
- 点 `.tex` 进编辑器；点 **PDF/图片** 在右栏打开 DSH 原生预览（先复制到工作区 `.latex-studio-preview/<项目哈希>/`）；
- 项目栏 `◧` 折叠文件树。

### 4. 编辑与保存

单文件编辑 + 行号；`Ctrl+S` 保存（只在有改动时可用），`Ctrl+Enter` 编译；切换文件时未保存会提示。

### 5. 编译

1. 在**项目根目录**执行 `<engine> -interaction=nonstopmode -file-line-error -synctex=1 <main>`；
2. 根据 `.aux` 只跑 `biber` 或 `bibtex` 之一；
3. 日志若仍有 `Rerun to get` / `Label(s) may have changed` / `There were undefined references`，再补一遍；
4. 状态栏显示 `错误 · 警告 · 页数 · 遍数 · 耗时`。

两个提速设计：

- **无改动跳过**：一条 `find -newer` 检查，源码都比 PDF 旧时直接复用；
- **远端单次往返**：首遍 + 文献工具 + 后续遍拼成一条远程命令，只进一次远端环境。

### 6. 诊断

红色 `✕` 错误（`文件:行: 信息`，点击跳行）、可折叠警告、缺失文件、「日志」展开 TeX 日志尾部。

### 7. PDF 预览

**打开 PDF** 打开 DSH 自带文档预览：**原生 PDF.js 阅读器**（可选中/复制文字、支持缩放），不是浏览器 iframe。因为 `dsh-resource://file/session/...` 按会话工作区解析，插件先把 PDF 复制到 `.latex-studio-preview/<项目哈希>/`，所以两个项目的 `main.pdf` 不会互相串。按钮只在编译成功后出现。

### 8. 仿 Codex 的批注工作流（重点）

目标：在 PDF 上标注**多处文段**，每处带自己的修改要求，最后一起提交。

**步骤**

1. 编译并打开 PDF 预览；
2. 在正文上拖选文字，出现浮动条：`[ 引用 ] [ 加批注 ]`；
3. 点 **加批注** → 右下角批注篮新增 `#1 · p.3`（编号 + 页码），下面写「这条要改成什么」；
4. 继续选下一段：`#2 · p.5` ……；
5. 点 **全部插入对话**，每条按顺序变成输入框里的引用节点：

   ```
   [批注 #1 · p.3] 原文选段……
   要求：这里把符号统一成 \bar{x}

   [批注 #2 · p.5] 另一段原文……
   要求：这张图换成引用图
   ```

6. 补一句总述（如「按上面两点改」）发送。

**「引用」与「加批注」**

| 按钮 | 行为 | 场景 |
|---|---|---|
| **引用** | 立刻把选中文字作为一条引用插入输入框 | 只引一段、顺手补要求 |
| **加批注** | 放进批注篮，带编号、页码和专属要求 | 多处一起改、最后统一提交 |

**批注篮**：标题显示条数、每条有原文摘录、要求输入框、`×` 删除；底部 **清空** / **全部插入对话**；右上 `×` 只收起面板。切换会话或项目时自动清空。

**快捷键**：选中文字后 `Ctrl+Shift+A`（macOS `Cmd+Shift+A`）直接加入批注篮。

**实现原理**：DSH 原生预览用 pdf.js 渲染出真正的文字层，插件监听 `selectionchange`，只在 `.textLayer` 内响应；插入走输入框的 `inputActions.insertQuote`（与官方 `message-quotes` 同一入口），拿不到时降级为复制到剪贴板。页码按文字层在预览里的顺序推断。

**与 Codex 对照**

| Codex 的 annotation | 本插件 |
|---|---|
| 选中 → 「提出修改要求」 | 选中 → **引用** / **加批注** |
| 编号注释 + 截图 | 编号 + 页码 + 文字（**暂不支持截图**） |
| PDF 页内锚点 | 不做（预览器属于 DSH） |
| 与输入框同进程直接写入 | 走 DSH `insertQuote`，不可用时降级剪贴板 |
| 一次提交多条 | **支持**：批注篮 → 全部插入对话 |

### 9. 切换项目 / 多项目

**切换项目…** 打开项目弹窗。每个项目有独立的预览副本路径、发现缓存和批注篮；再次打开同一项目先用缓存立即渲染，后台静默刷新，「重新扫描」强制刷新。

### 10. 工作区与项目目录

项目可以**不等于**会话工作区。打开外部项目不会改变 agent 的 `bash/read` 工作目录——agent 仍只看会话工作区；预览和批注走插件自己的通道。如果希望 agent 直接改论文文件，把会话工作区开在论文目录上。

## 远程编译（SSH / Pod）

远端项目复用 `dsh-ssh-toolkit`：文件走 SFTP，命令走 `sshPool`。当 SSH 落地机器没有 TeX、TeX 在 Pod 里时，用 `remoteWrapper`：

```yaml
config:
  remoteWrapper: >-
    bash -c '. /etc/profile.d/dsmlp-login.sh;
    kubectl exec "$(cat ~/.dsmlp/current_pod)" -- bash -c
    "$(printf %s "$1" | sed "s#/dsmlp/home-fs03/<uid>/<gid>/<user>#/home/<user>#g")"' --
```

- 构建脚本作为参数传入，所以 `--` 和 `"$1"` 是必需的；
- 两端都用 `bash -c`（不带 `-l`）跳过登录 profile，实测每条命令省约 2.5 秒；
- `sed` 把登录节点路径映射成 Pod 内路径；
- 固定 Pod 也可以写成 `kubectl exec <pod> -- bash -c …`。

## 配置项

| 字段 | 默认 | 含义 |
|---|---|---|
| `engine` | `pdflatex` | 新项目默认引擎（工具栏可切换） |
| `maxPasses` | `4` | 单次编译最多跑几遍 TeX |
| `timeoutMs` | `180000` | 单个进程超时 |
| `remoteWrapper` | 空 | 跨机器执行构建脚本的前缀命令 |

## 常见问题

**编译报 `pdflatex: command not found`**：SSH 落点没有 TeX。配置 `remoteWrapper` 或改用本地项目。

**打开 PDF 报 `workspace-file/not-found`**：预览副本发布失败；状态栏会显示「发布预览失败: 原因」。确认工作区可写，重新扫描后再编一次。

**PDF 文字选不中**：确认是 DSH 原生预览；纯图片扫描件没有文字层。

**批注浮动条不出现**：要在正文文字层上选区；且当前 DSH 版本要能拿到输入框接口，否则插入降级为复制到剪贴板。

**首次打开项目偏慢**：首次要扫描并读文件头；之后命中缓存。远端还要建立一次连接。

**编译很慢**：远端每次构建要进一次远程环境；插件已把多遍合并、无改动跳过。

## 已知限制

- 没有 SyncTeX、没有打字即编译、没有协同编辑；
- 批注只支持**文字选区**，截图/区域标注需要自绘渲染器 + DSH 的附件接口；
- 外部项目对 agent 的文件工具不可见；
- 项目发现只扫一层，深层 monorepo 建议开在论文目录；
- 缺 TeX 包只报诊断，安装交给 TeX 发行版（如 `mpm --install=...`）。

## 开发与测试

```bash
npm test                                            # node --test tests/*.test.mjs
node scripts/service-smoke.mjs <包含 main.tex 的项目目录>
```

```
index.js               Host 入口：服务 + Typert 绑定
client.js              浏览器半区：tab、弹窗、文件树、编辑器、批注
src/engine.js          发现打分、日志解析
src/build.js           构建循环与批量远程脚本
src/host/service.js    RPC 与项目路由
src/host/backends.js   本地（fs/spawn）与远端（SFTP/sshPool）后端
src/host/paths.js      远端工作区占位目录路由
src/host/typert.js     线协议
tests/                 单元测试与浏览器注册审计
scripts/service-smoke.mjs  真实项目冒烟
```

## License

MIT
