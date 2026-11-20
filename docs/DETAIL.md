# LaTeX Studio — detail

## What problem this solves

Editor extensions that render LaTeX usually compile **the file you opened**.
That fails for a real paper: the chapter files have no preamble, the
bibliography never runs, `\ref` stays `??`, and figures resolve against the
wrong directory. LaTeX Studio treats the repository as one project: it locates
the main `.tex`, builds in the project root, drives the multi-pass loop and the
bibliography tool, and only then hands the PDF to the viewer.

## How a build runs

1. **Discover** — list `.tex` files (one directory level below the workspace
   root, skipping `build/`, `node_modules/`, hidden directories), read the head
   of each and rank candidates: `% !TEX root` comment, then files with
   `\documentclass` scored by name (`main`, `paper`, `manuscript`, …), depth and
   presence of `\begin{document}`.
2. **Typeset** — run `<engine> -interaction=nonstopmode -file-line-error
   -synctex=1 <main>` in the project directory.
3. **Bibliography** — when the `.aux` carries `\bibdata` (or the log asks for a
   `.bbl`), run `bibtex`; when the log/aux look like `biblatex`, run `biber`.
4. **Settle** — compare `main.aux` between passes and read the rerun hints; stop
   once the file stops changing, with a hard pass cap.
5. **Report** — parse the transcript into typed diagnostics and return the PDF
   path; the browser opens that PDF in DSH's document preview in a second pane.

## Where builds execute

- **Local workspace**: the Host plugin spawns the TeX binary directly in the
  project directory.
- **Remote (SSH) workspace**: session cwd is a placeholder directory; the plugin
  decodes it into `{host, remote path}`, reads and writes through SFTP and runs
  commands through the `sshPool` service. Set `remoteWrapper` when TeX lives
  behind another hop (`kubectl exec <pod> -- bash -lc`).

## Deliberate limits

- The Sidebar's own PDF viewer is reused; the plugin does not bundle a second
  PDF renderer, so no SyncTeX scroll sync yet.
- Discovery is shallow by design; a deeply nested monorepo is better opened as
  its own workspace.
- Diagnostics come from the transcript; a TeX distribution that refuses to
  install missing packages reports them but cannot fix them.
