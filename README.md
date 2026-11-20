# LaTeX Studio

A project-level LaTeX workspace for DeepSeek Harness. It treats a repository as
**one project** instead of one file: it finds the main `.tex`, builds the whole
document (including `\input`, bibliography and the extra passes that fix
cross-references), shows the diagnostics, and previews the PDF in the right
Sidebar — next to the editor, without leaving DSH.

## What it does

- **Project discovery** — scans the session workspace (one level deep) for
  `.tex` files carrying `\documentclass`, ranks them (magic `% !TEX root`
  first, then `main`/`paper`-style names), and offers the candidates.
- **Project build** — runs the selected engine (`pdflatex`, `xelatex`,
  `lualatex`) in the project directory, runs `bibtex`/`biber` once when the
  document needs it, and repeats passes until the `.aux` settles. This is what
  makes `\ref`, `\cite`, `.toc` and multi-file chapters correct.
- **Editing** — a real editor pane over the project's `.tex` files with
  `Ctrl+S` save and `Ctrl+Enter` compile.
- **Diagnostics** — parsed from the TeX transcript: `file:line: message`
  errors, undefined references/citations, missing `.sty`/`.bbl` files and
  warnings. Clicking a diagnostic opens the file at that line.
- **Preview** — after a build, the PDF opens in DSH's own document preview in a
  second Sidebar pane; the native viewer provides zoom, text selection and
  automatic reload.
- **Local or remote** — the same tab works in a local workspace (TeX spawned
  directly) and in an SSH workspace (files over SFTP, commands over the
  `sshPool` service from `dsh-ssh-toolkit`).

## Requirements

- A TeX distribution on the machine that runs the build:
  - local workspace: TeX tools on the Host machine (`pdflatex`, optional
    `bibtex`/`biber`);
  - remote workspace: TeX on the remote host — or set `remoteWrapper` to a
    command prefix that enters an environment that has it, for example
    `kubectl exec <pod> -- bash -lc`.
- For remote workspaces, the `dsh-ssh-toolkit` bundle must be installed (it
  publishes the `sshPool` service this plugin drives).

## Configuration

`cordis.patch.yml` (or the plugin row in the profile):

| Field | Default | Meaning |
|---|---|---|
| `engine` | `pdflatex` | Default engine for new sessions |
| `maxPasses` | `4` | Hard cap on TeX passes per build |
| `timeoutMs` | `180000` | Timeout of one process |
| `remoteWrapper` | `''` | Remote-shell prefix, e.g. `kubectl exec <pod> -- bash -lc` |

## Using it

1. Open the right Sidebar and add the **LaTeX Studio** tab from the guide.
2. Pick the project and main file (the defaults come from discovery).
3. Edit, `Ctrl+S`, `Ctrl+Enter`; the PDF opens in the neighbouring pane.
4. Click a diagnostic to jump to the offending line.

## Limits (v0.1)

- No SyncTeX, no edit-on-type recompilation, no collaborative editing.
- Discovery scans one directory level; open the workspace at the paper
  directory (or use a workspace whose root is the project) for the best result.
- A missing TeX package is reported as a diagnostic; installing it is left to
  the TeX distribution (e.g. `mpm --install=...` on MiKTeX).
