# LaTeX Studio — detail

## What problem this solves

Editor extensions that render LaTeX usually compile **the file you opened**.
That fails for a real paper: chapter files have no preamble, the bibliography
never runs, `\ref` stays `??`, and figures resolve against the wrong directory.
LaTeX Studio treats the repository as one project: it locates the main `.tex`,
builds in the project root, drives bibliography and multi-pass settling, then
hands the PDF to DSH's native document preview.

## How a build runs

1. **Discover** — list `.tex` files one level below the project root (skipping
   `build/`, `node_modules/`, hidden directories), read the head of each (one
   batched round trip on remote backends) and rank candidates: `% !TEX root`
   comment first, then `\documentclass` files scored by name, depth and
   `\begin{document}`.
2. **Up-to-date check** — one cheap round trip: if no `.tex`/`.bib`/`.cls`/`.sty`
   is newer than the built PDF, the existing artifacts are returned and TeX is
   skipped (`skipped: true`, “no changes, reused”).
3. **Typeset** — run `<engine> -interaction=nonstopmode -file-line-error
   -synctex=1 <main>` in the project directory. On remote backends the whole
   sequence is one shell script: first pass, then only the bibliography tool the
   `.aux` asks for (`biber` for `\abx@aux@`, else `bibtex` for `\bibdata`), one
   more pass, and a final pass only when the log still reports `Rerun to get` /
   `Label(s) may have changed` / `There were undefined references`.
4. **Report** — parse the transcript into typed diagnostics and return the PDF
   path. The Client then publishes the PDF into the workspace and opens DSH's
   document preview.

## Opening a project outside the workspace

A project is a plain descriptor the Client keeps in `localStorage`
(`{kind:'local', root}` or `{kind:'remote', hostId, root}`), so the Host holds
no project state. Every RPC carries it as the last argument; without it the call
keeps the “session workspace” routing.

- **Local folder** — the Host asks `ctx.directoryPicker` for its `native`
  capability and opens the OS chooser on the DSH screen.
- **SSH folder** — the Host uses the `ssh` service published by
  `dsh-ssh-toolkit` (`listHosts`, `resolveRemoteHome`, `listRemoteDir`) to draw
  the in-app browser.
- **Builds** — `withProjectBackend` builds a `localBackend(root)` or a
  `remoteBackend({hostId, root})`, so SFTP reads and `remoteWrapper` builds work
  with the project folder as root and cwd.

## Preview and annotations

`dsh-resource://file/session/...` resolves against the **session workspace**, so
a project outside it cannot be previewed directly. `latex/publishFile` copies
the artifact into `.latex-studio-preview/<project-hash>/<relative path>` inside
the workspace (project-hash derived from `kind:host:root`, so two repos never
collide) and the Client opens that address. DSH's own document preview then
renders it with PDF.js — a real text layer, selection and zoom — instead of a
browser embed. Reads that race the pod's NFS visibility are retried.

The annotation bridge listens for `selectionchange` in that text layer and shows
a floating bar (*Quote* / *Annotate*). Insertion uses the composer's
`inputActions.insertQuote` seam, reached through the session-scoped
`inputActions` prop that `ui-conversation` provides; when it is unavailable the
text falls back to the clipboard. The basket keeps several annotated passages
with per-item instructions and inserts them as consecutive quote nodes
(`Ctrl+Shift+A` adds the current selection to the basket).

## Where builds execute

- **Local workspace / local project**: the Host spawns TeX directly.
- **Remote (SSH)**: session cwd or project root is a remote absolute path; files
  go through SFTP and commands through `sshPool`. `remoteWrapper` re-enters the
  pod that actually has TeX.

## Deliberate limits

- No SyncTeX scroll sync between the editor and the preview yet.
- Annotations are text-only; image regions would need a second renderer plus an
  attachment API DSH does not expose to plugins.
- Discovery is shallow by design; a deeply nested monorepo is better opened as
  its own project folder.
- Diagnostics come from the transcript; a TeX distribution that refuses to
  install missing packages reports them but cannot fix them.
