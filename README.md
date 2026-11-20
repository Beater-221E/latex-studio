# LaTeX Studio

A project-level LaTeX workspace for DeepSeek Harness. It treats a repository as
**one project** instead of one file: it finds the main `.tex`, builds the whole
document (`\input`, bibliography, multi-pass cross-references), shows the
diagnostics, previews the PDF in DSH's native viewer, and lets you quote
passages from that preview straight into the chat.

## Features

- **Open any project folder** — a modal picks a local folder (native OS dialog)
  or an SSH host folder (in-app browser) and opens it as a project **without
  changing the session workspace**. Reachable from the composer's **+** menu or
  the Studio toolbar; the choice is remembered per session.
- **Project discovery** — scans one level below the project root for
  `\documentclass`, ranks candidates (`% !TEX root` first, then `main`/`paper`
  names), and caches the result so re-opening a project is instant.
- **Whole-project build** — the selected engine runs in the project directory;
  only the bibliography tool the `.aux` asks for runs; the last pass runs only
  when the log reports pending reruns; unchanged sources skip TeX entirely and
  reuse the existing PDF.
- **Editor** — tree + source pane with `Ctrl+S` save and `Ctrl+Enter` compile.
- **Diagnostics** — parsed from the transcript (`file:line: message`, missing
  `.sty`/`.bbl`, undefined references); clicking one jumps to the line.
- **Tree previews** — clicking an image or PDF in the tree opens it in DSH's
  document preview (the file is copied into the workspace first).
- **PDF preview** — the built PDF opens in DSH's **native** document preview
  (PDF.js text layer, selection, zoom) from a per-project copy inside the
  workspace.
- **Annotations** — select text in the preview and a floating bar appears:
  *Quote* inserts a quote node into the composer; *Annotate* collects the
  passage in a floating basket where each item can carry its own instruction;
  **Insert all** pushes every annotation into the composer at once
  (`Ctrl+Shift+A` adds to the basket).
- **Local or remote** — the same code builds locally (spawn) or over SSH
  (SFTP + `sshPool` from `dsh-ssh-toolkit`).

## Requirements

- TeX on the machine that builds: `pdflatex` (or `xelatex`/`lualatex`),
  optionally `bibtex`/`biber`.
- For SSH workspaces: the `dsh-ssh-toolkit` bundle (it publishes `sshPool`).
- When TeX lives behind another hop (a Kubernetes pod), set `remoteWrapper`.

## Install

```bash
dsh plugin --profile desktop add github:Beater-221E/latex-studio
```

For local development, `dsh plugin --profile desktop add link:<path-to-repo>`.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `engine` | `pdflatex` | Default engine for new sessions |
| `maxPasses` | `4` | Hard cap on TeX passes per build |
| `timeoutMs` | `180000` | Timeout of one process |
| `remoteWrapper` | `''` | Prefix that runs the build script somewhere else |

### Remote host where TeX lives in a pod (UCSD DSMLP)

The wrapper is prepended to one single-quoted script, so it must end where that
script is the last argument. The pod mounts the home directory under a different
path, so the `cd` inside the script needs translating too:

```yaml
config:
  remoteWrapper: >-
    bash -c '. /etc/profile.d/dsmlp-login.sh;
    kubectl exec "$(cat ~/.dsmlp/current_pod)" -- bash -c
    "$(printf %s "$1" | sed "s#/dsmlp/home-fs03/<uid>/<gid>/<user>#/home/<user>#g")"' --
```

`--` and `"$1"` are load-bearing: the outer shell receives the script as `$1`
and hands it to the pod's shell, while sourcing the cluster profile gives
`kubectl` its kubeconfig. Plain `bash -c` on both hops avoids the login
profiles, which cost seconds per build.

## Using it

1. Press **+** in the composer (or the Studio toolbar) → **Open LaTeX project**
   → pick *Local folder* or *SSH host* → **Open project**.
2. Pick the main file if discovery offers more than one; edit with `Ctrl+S`.
3. `Ctrl+Enter` (or **Compile**) builds; **Open PDF** opens the preview.
4. Select text in the preview to quote or annotate it into the chat.

## Layout

```
index.js               Host entry: service + Typert binding
client.js              Browser half (tab, dialog, tree, editor, annotations)
src/engine.js          Discovery ranking, dependency scan, log parsing
src/build.js           Build loop, diagnostics, batched remote script
src/host/service.js    Capability: project routing, RPC implementations
src/host/backends.js   local (fs/spawn) and remote (SFTP/sshPool) backends
src/host/paths.js      Remote workspace placeholder routing
src/host/typert.js     Wire contract
tests/                 node --test tests/*.test.mjs
scripts/service-smoke.mjs  Real-project smoke run
```

## Limits

- No SyncTeX, no live recompilation, no collaborative editing.
- Annotations cover **text selections**; image regions would need a second
  renderer and an attachment API DSH does not expose to plugins yet.
- A project opened outside the workspace stays outside it: the agent's own
  file tools still see only the session workspace.
- Discovery is shallow by design; deeply nested monorepos are better opened as
  their own project folder.
- A missing TeX package is reported as a diagnostic; installing it is left to
  the distribution (e.g. `mpm --install=...` on MiKTeX).
