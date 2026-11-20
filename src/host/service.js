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
const TEXT_FILE_RE = /\.(?:tex|ltx|bib|cls|sty|bst|cfg|def|txt|md|latexmkrc)$/i;

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
  const lastBuild = new Map();
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

  async function discover(sessionId, projectPath) {
    const base = normalizeRel(typeof projectPath === 'string' ? projectPath : '');
    return withBackend(sessionId, async (backend, route) => {
      const files = await listTexFiles(backend, base);
      const heads = {};
      for (const rel of files.slice(0, MAX_TEX_READS)) {
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

  async function readFile(sessionId, filePath) {
    const rel = normalizeRel(filePath);
    if (!TEXT_FILE_RE.test(rel)) throw new Error(`not an editable LaTeX file: ${rel}`);
    return withBackend(sessionId, async (backend) => ({ path: rel, text: await backend.readText(rel) }));
  }

  async function writeFile(sessionId, filePath, text) {
    const rel = normalizeRel(filePath);
    if (!TEXT_FILE_RE.test(rel)) throw new Error(`not an editable LaTeX file: ${rel}`);
    if (typeof text !== 'string') throw new Error('the file content must be a string');
    if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) throw new Error('the file is too large to save from the editor');
    return withBackend(sessionId, (backend) => backend.writeText(rel, text));
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

  async function compile(sessionId, main, engine) {
    const mainRel = normalizeRel(main);
    if (!/\.tex$/i.test(mainRel)) throw new Error('the main file must be a .tex file');
    if (activeSessions.has(sessionId)) throw new Error('a build is already running for this session');
    activeSessions.add(sessionId);
    try {
      return await withBackend(sessionId, async (backend) => {
        const dir = dirnamePosix(mainRel);
        const file = basenamePosix(mainRel);
        const result = await buildProject({
          root: dir,
          main: file,
          engine: engine || settings.engine,
          maxPasses: settings.maxPasses,
          timeoutMs: settings.timeoutMs,
          run: (argv, options) => backend.run(argv, options),
          readText: (relPath) => backend.readText(joinPosix(dir, relPath)).catch(() => null),
        });
        const mapped = {
          ...result,
          pdf: result.pdf ? joinPosix(dir, result.pdf) : null,
          errors: result.errors.map((entry) => workspaceRelative(dir, entry)),
          warnings: result.warnings.map((entry) => workspaceRelative(dir, entry)),
          undefinedRefs: result.undefinedRefs.map((entry) => workspaceRelative(dir, entry)),
        };
        lastBuild.set(sessionId, { at: Date.now(), summary: {
          ok: mapped.ok, pdf: mapped.pdf, passes: mapped.passes, pages: mapped.pages,
          errors: mapped.errors.length, warnings: mapped.warnings.length, durationMs: mapped.durationMs,
        } });
        return mapped;
      });
    } finally {
      activeSessions.delete(sessionId);
    }
  }

  function status(sessionId) {
    const entry = lastBuild.get(sessionId);
    return entry ? { ...entry.summary, at: entry.at } : null;
  }

  return { settings, discover, readFile, writeFile, compile, status };
}
