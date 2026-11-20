/**
 * The Host-side capability: resolve a session workspace, then discover, read,
 * write and build LaTeX projects through the matching backend.
 *
 * Every method takes a Session id from the wire, so the Client never needs to
 * know whether its workspace is local or an SSH placeholder.
 */
import { basenamePosix, dirnamePosix, joinPosix, normalizeRel, groupProjects, HEAD_LIMIT } from '../engine.js';
import { buildProject, normalizeEngine } from '../build.js';
import { routeByCwd } from './paths.js';
import { localBackend, remoteBackend, SKIP_DIRS } from './backends.js';

const MAX_TEX_READS = 64;
const MAX_DIRS = 48;
const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_PDF_BYTES = 64 * 1024 * 1024;
const TEXT_FILE_RE = /\.(?:tex|ltx|bib|cls|sty|bst|cfg|def|txt|md|latexmkrc)$/i;
const PREVIEW_FILE_RE = /\.(?:pdf|png|jpe?g|gif|webp|svg|html?)$/i;

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Read a file that a pod build just produced; the login-node NFS view can lag. */
async function readWithRetry(readFn, attempts = 8, delay = 300) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await readFn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await sleepMs(delay);
    }
  }
  throw lastError;
}

function projectSlug(project) {
  if (!project || typeof project !== 'object') return 'workspace';
  const text = `${project.kind}:${project.hostId || ''}:${project.root}`;
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  }
  return `p${hash.toString(36)}`;
}

function pagesFromLog(text) {
  const match = /Output written on [^(]*\((\d+) pages?\)/.exec(String(text || ''));
  return match ? Number(match[1]) : null;
}

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(number)));
}

export function createLatexService(ctx, config = {}) {
  const settings = {
    engine: normalizeEngine(config.engine),
    maxPasses: clampInteger(config.maxPasses, 1, 10, 4),
    timeoutMs: clampInteger(config.timeoutMs, 10000, 900000, 180000),
    remoteWrapper: typeof config.remoteWrapper === 'string' ? config.remoteWrapper.trim() : '',
  };
  const activeSessions = new Set();

  async function resolveSession(sessionId) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('a session id is required');
    const sessions = ctx.get('sessions');
    const live = sessions && typeof sessions.get === 'function' ? sessions.get(sessionId) : undefined;
    let header = live && live.header;
    if (!header) {
      const persistence = ctx.get('sessionPersistence');
      if (persistence && typeof persistence.stat === 'function') {
        const stored = await persistence.stat(sessionId);
        header = stored && stored.header;
      }
    }
    const policy = ctx.get('sandboxPolicy');
    const cwd = (header && header.cwd) || (policy && policy.workspaceRoot);
    if (!cwd) throw new Error('cannot resolve the session workspace root: the session has no live header and is not persisted');
    return routeByCwd(cwd);
  }

  async function withBackend(sessionId, work) {
    const route = await resolveSession(sessionId);
    const backend = route.kind === 'remote'
      ? await remoteBackend(ctx, route, { remoteWrapper: settings.remoteWrapper })
      : localBackend(route.root);
    try {
      return await work(backend, route);
    } finally {
      backend.dispose();
    }
  }

  /** Absolute local (POSIX or Windows drive) path check for an opened project. */
  function isAbsoluteProjectRoot(root) {
    return typeof root === 'string' && (root.startsWith('/') || /^[A-Za-z]:[\\/]/.test(root));
  }

  /**
   * Route one call either to the session workspace (legacy mode) or to an
   * explicitly opened project folder — local or on an SSH host. A project is a
   * plain descriptor from the wire, so the Host keeps no per-project state and
   * the Client can persist it (and survive a DSH restart).
   */
  async function withProjectBackend(sessionId, project, work) {
    if (!project || typeof project !== 'object') return withBackend(sessionId, work);
    const root = typeof project.root === 'string' ? project.root.trim() : '';
    if (!isAbsoluteProjectRoot(root)) throw new Error('a project root must be an absolute path');
    if (project.kind === 'remote') {
      const hostId = typeof project.hostId === 'string' ? project.hostId : '';
      if (!hostId) throw new Error('a remote project needs an SSH host id');
      const pool = ctx.get('sshPool');
      if (!pool || typeof pool.acquire !== 'function') {
        throw new Error('remote projects need the dsh-ssh-toolkit bundle (it publishes sshPool)');
      }
      const hostConfig = typeof pool.getHost === 'function' ? pool.getHost(hostId) : undefined;
      if (!hostConfig) throw new Error(`SSH host "${hostId}" is not configured`);
      const backend = await remoteBackend(ctx, { kind: 'remote', hostId, remoteCwd: root }, {
        remoteWrapper: settings.remoteWrapper,
      });
      try {
        return await work(backend, { kind: 'remote', hostId });
      } finally {
        backend.dispose();
      }
    }
    const backend = localBackend(root);
    try {
      return await work(backend, { kind: 'local', root });
    } finally {
      backend.dispose();
    }
  }

  async function listTexFiles(backend, base) {
    const files = [];
    let directoryBudget = MAX_DIRS;
    const queue = [{ rel: base, depth: 1 }];
    while (queue.length > 0) {
      const item = queue.shift();
      let entries;
      try {
        entries = await backend.listDir(item.rel);
      } catch {
        continue;
      }
      entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
      for (const entry of entries) {
        if (!entry || typeof entry.name !== 'string' || entry.name.startsWith('.')) continue;
        const child = joinPosix(item.rel, entry.name);
        if (entry.type === 'directory') {
          if (SKIP_DIRS.has(entry.name) || item.depth <= 0 || directoryBudget <= 0) continue;
          directoryBudget -= 1;
          queue.push({ rel: child, depth: item.depth - 1 });
          continue;
        }
        if (/\.tex$/i.test(entry.name)) files.push(child);
      }
    }
    return files;
  }

  async function discover(sessionId, projectPath, project) {
    const base = normalizeRel(typeof projectPath === 'string' ? projectPath : '');
    return withProjectBackend(sessionId, project, async (backend, route) => {
      const files = await listTexFiles(backend, base);
      const headPaths = files.slice(0, MAX_TEX_READS);
      let heads = {};
      if (headPaths.length > 0 && typeof backend.readTextHeads === 'function') {
        try {
          heads = await backend.readTextHeads(headPaths, HEAD_LIMIT);
        } catch {
          heads = {};
        }
      }
      for (const rel of headPaths) {
        if (typeof heads[rel] === 'string') continue;
        try {
          heads[rel] = String(await backend.readText(rel)).slice(0, HEAD_LIMIT);
        } catch {
          /* an unreadable source is not fatal for discovery */
        }
      }
      const projects = groupProjects(files, heads);
      const ordered = projects.length > 0 ? projects : [{ root: base, main: null, files, score: 0 }];
      return {
        workspace: route.kind,
        hostId: route.kind === 'remote' ? route.hostId : null,
        base,
        projects: ordered,
        files,
        reason: ordered.some((project) => project.main) ? 'ok' : 'no-main',
      };
    });
  }

  /** Directory listing for the project tree (one level; the Client expands lazily). */
  async function listDir(sessionId, dirPath, project) {
    const rel = normalizeRel(typeof dirPath === 'string' ? dirPath : '');
    return withProjectBackend(sessionId, project, async (backend) => {
      const entries = await backend.listDir(rel);
      return {
        path: rel,
        entries: entries
          .filter((entry) => entry && typeof entry.name === 'string' && !entry.name.startsWith('.'))
          .map((entry) => ({ name: entry.name, type: entry.type === 'directory' ? 'directory' : entry.type === 'file' ? 'file' : 'other' })),
      };
    });
  }

  async function readFile(sessionId, filePath, project) {
    const rel = normalizeRel(filePath);
    if (!TEXT_FILE_RE.test(rel)) throw new Error(`not an editable LaTeX file: ${rel}`);
    return withProjectBackend(sessionId, project, async (backend) => ({ path: rel, text: await backend.readText(rel) }));
  }

  /**
   * Binary read for the conversation-side PDF view.
   *
   * Only `.pdf` is accepted so this endpoint cannot become a generic file
   * reader, and the bytes travel as base64 inside the Typert JSON result —
   * which is why the 64 MiB cap exists (base64 inflates by a third).
   */
  async function readBytes(sessionId, filePath, project) {
    const rel = normalizeRel(filePath);
    if (!/\.pdf$/i.test(rel)) throw new Error(`only PDF files can be streamed to the preview: ${rel}`);
    return withProjectBackend(sessionId, project, async (backend) => {
      const data = Buffer.from(await backend.readBytes(rel));
      if (data.length > MAX_PDF_BYTES) {
        throw new Error(`the PDF is too large to preview: ${data.length} bytes (limit ${MAX_PDF_BYTES})`);
      }
      return { path: rel, bytes: data.length, base64: data.toString('base64') };
    });
  }

  /**
   * Copy a built PDF into the *session workspace* under a stable name. The
   * built-in document preview resolves `dsh-resource://file/session/...`
   * against the workspace, so this is what lets its native PDF.js viewer (text
   * layer, selection, zoom) display a project that lives outside the workspace.
   */
  async function publishFile(sessionId, filePath, project) {
    const rel = normalizeRel(filePath);
    if (!PREVIEW_FILE_RE.test(rel)) throw new Error(`not a previewable file: ${rel}`);
    if (!project) return { path: rel };
    const data = await withProjectBackend(sessionId, project, async (backend) => {
      const bytes = Buffer.from(await readWithRetry(() => backend.readBytes(rel)));
      if (bytes.length > MAX_PDF_BYTES) {
        throw new Error(`the file is too large to preview: ${bytes.length} bytes (limit ${MAX_PDF_BYTES})`);
      }
      return bytes;
    });
    const target = `.latex-studio-preview/${projectSlug(project)}/${rel}`;
    return withBackend(sessionId, async (backend) => {
      const parent = dirnamePosix(target);
      if (parent) await backend.mkdir(parent);
      await backend.writeBytes(target, data);
      return { path: target, bytes: data.length };
    });
  }

  async function writeFile(sessionId, filePath, text, project) {
    const rel = normalizeRel(filePath);
    if (!TEXT_FILE_RE.test(rel)) throw new Error(`not an editable LaTeX file: ${rel}`);
    if (typeof text !== 'string') throw new Error('the file content must be a string');
    if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) throw new Error('the file is too large to save from the editor');
    return withProjectBackend(sessionId, project, (backend) => backend.writeText(rel, text));
  }

  function workspaceRelative(dir, entry) {
    if (!entry || typeof entry !== 'object') return null;
    const file = typeof entry.file === 'string' ? entry.file : null;
    let mapped = file;
    if (file) {
      const normal = file.replace(/\\/g, '/').replace(/^\.\//, '');
      if (/^[A-Za-z]:\//.test(normal) || normal.startsWith('/')) {
        const root = dir === '' ? null : `${dir}/`;
        mapped = root && normal.includes(root) ? normal.slice(normal.indexOf(root) + root.length) : normal.split('/').pop();
      } else {
        mapped = joinPosix(dir, normal);
      }
    }
    return { ...entry, file: mapped };
  }

  async function compile(sessionId, main, engine, project) {
    const mainRel = normalizeRel(main);
    if (!/\.tex$/i.test(mainRel)) throw new Error('the main file must be a .tex file');
    if (activeSessions.has(sessionId)) throw new Error('a build is already running for this session');
    activeSessions.add(sessionId);
    try {
      return await withProjectBackend(sessionId, project, async (backend) => {
        const dir = dirnamePosix(mainRel);
        const file = basenamePosix(mainRel);
        const base = file.replace(/\.tex$/i, '');
        const pdfRel = `${base}.pdf`;
        // One cheap round trip: when no source is newer than the built PDF,
        // reuse the existing artifacts instead of spawning TeX again.
        let skip = false;
        try {
          const script = [
            `[ -f ${shellQuote(pdfRel)} ] || exit 1`,
            `if find . -maxdepth 3 \\( -name '*.tex' -o -name '*.bib' -o -name '*.cls' -o -name '*.sty' \\) -newer ${shellQuote(pdfRel)} -print -quit | grep -q .; then exit 1; fi`,
            'exit 0',
          ].join('; ');
          const check = await backend.run(['sh', '-c', script], { timeoutMs: 20000, cwd: dir });
          skip = Boolean(check && check.code === 0);
        } catch {
          skip = false;
        }
        if (skip) {
          const logText = String((await backend.readText(joinPosix(dir, `${base}.log`)).catch(() => '')) || '');
          const skippedResult = {
            ok: true,
            skipped: true,
            root: dir,
            main: file,
            engine: engine || settings.engine,
            pdf: joinPosix(dir, pdfRel),
            passes: 0,
            steps: [],
            errors: [],
            warnings: [],
            missingFiles: [],
            undefinedRefs: [],
            pages: pagesFromLog(logText),
            overfull: 0,
            underfull: 0,
            durationMs: 0,
            failure: null,
            logTail: logText.slice(-12000),
          };
          return skippedResult;
        }
        const result = await buildProject({
          root: dir,
          main: file,
          engine: engine || settings.engine,
          maxPasses: settings.maxPasses,
          timeoutMs: settings.timeoutMs,
          run: (argv, options) => backend.run(argv, options),
          runBatch: typeof backend.runBatch === 'function'
            ? (commands, options) => backend.runBatch(commands, options)
            : undefined,
          runScript: typeof backend.runScript === 'function'
            ? (script, options) => backend.runScript(script, options)
            : undefined,
          readText: (relPath) => readWithRetry(() => backend.readText(joinPosix(dir, relPath))).catch(() => null),
        });
        const mapped = {
          ...result,
          pdf: result.pdf ? joinPosix(dir, result.pdf) : null,
          errors: result.errors.map((entry) => workspaceRelative(dir, entry)),
          warnings: result.warnings.map((entry) => workspaceRelative(dir, entry)),
          undefinedRefs: result.undefinedRefs.map((entry) => workspaceRelative(dir, entry)),
        };
        return mapped;
      });
    } finally {
      activeSessions.delete(sessionId);
    }
  }

  // ── project picking (local folder dialog + SSH folder browsing) ──────────

  async function pickDirectory() {
    const picker = ctx.get('directoryPicker');
    if (!picker || typeof picker.capability !== 'function') {
      throw new Error('no directory picker is installed in this profile');
    }
    const capability = picker.capability();
    if (!capability || capability.kind !== 'native' || typeof capability.pick !== 'function') {
      throw new Error('the installed directory picker cannot open a native folder dialog');
    }
    // The native backends expect an AbortSignal (they read signal.aborted).
    const picked = await capability.pick(new AbortController().signal);
    return { path: typeof picked === 'string' && picked.length > 0 ? picked : null };
  }

  async function sshHosts() {
    const ssh = ctx.get('ssh');
    if (!ssh || typeof ssh.listHosts !== 'function') return { hosts: [] };
    const state = await ssh.listHosts();
    const table = state && state.hosts && typeof state.hosts === 'object' ? state.hosts : {};
    const hosts = Object.values(table)
      .map((host) => ({
        id: String(host?.id ?? ''),
        name: String(host?.name ?? host?.id ?? ''),
        host: String(host?.host ?? ''),
        user: String(host?.user ?? ''),
      }))
      .filter((host) => host.id.length > 0);
    return { hosts };
  }

  async function remoteHome(hostId) {
    const ssh = ctx.get('ssh');
    if (!ssh || typeof ssh.resolveRemoteHome !== 'function') throw new Error('remote browsing needs dsh-ssh-toolkit');
    const home = await ssh.resolveRemoteHome(String(hostId ?? ''));
    return { home: typeof home === 'string' ? home : '' };
  }

  async function remoteList(hostId, target) {
    const ssh = ctx.get('ssh');
    if (!ssh || typeof ssh.listRemoteDir !== 'function') throw new Error('remote browsing needs dsh-ssh-toolkit');
    const path = typeof target === 'string' && target.startsWith('/') ? target : '/';
    const raw = await ssh.listRemoteDir(String(hostId ?? ''), path);
    if (!Array.isArray(raw)) {
      throw new Error((raw && raw.message) || 'the SSH host did not return a directory listing');
    }
    const entries = raw.map((entry) => ({
      name: String(entry?.name ?? ''),
      type: entry?.type === 'dir' ? 'directory' : entry?.type === 'file' ? 'file' : 'other',
    })).filter((entry) => entry.name.length > 0);
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    return { path, parent: parts.length === 0 ? '/' : `/${parts.join('/')}`, entries };
  }

  return { settings, discover, readFile, readBytes, writeFile, compile, pickDirectory, sshHosts, remoteHome, remoteList, listDir, publishFile };
}
