/**
 * Execution backends. One interface serves both worlds:
 *
 *   listDir(rel) / readText(rel) / writeText(rel, text) / run(argv, opts)
 *
 * `local` uses Node's file system and spawns TeX directly. `remote` rides the
 * sshPool service published by dsh-ssh-toolkit and speaks SFTP plus shell.
 * Every path is workspace-relative; the backend resolves and contains it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { posix } from 'node:path';
import { spawn } from 'node:child_process';

const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'dist', 'out', '.venv', 'venv', '__pycache__', '.cache', '.dsmlp', 'tmp', '.ipynb_checkpoints']);

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function runProcess(argv, options = {}) {
  const { cwd, timeoutMs = 180000, maxBytes = 4 * 1024 * 1024 } = options;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), { cwd, windowsHide: true, shell: false });
    } catch (error) {
      resolve({ code: -1, stdout: '', stderr: String(error && error.message ? error.message : error), failedToStart: true });
      return;
    }
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = timeoutMs > 0
      ? setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch { /* already gone */ }
        finish({ code: null, stdout, stderr: `${stderr}${stderr ? '\n' : ''}[timed out after ${timeoutMs}ms]`, timedOut: true });
      }, timeoutMs)
      : null;
    child.stdout?.on('data', (chunk) => {
      if (stdout.length < maxBytes) stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < maxBytes) stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => finish({ code: -1, stdout, stderr: `${stderr}${String(error && error.message ? error.message : error)}`, failedToStart: true }));
    child.on('close', (code) => finish({ code, stdout, stderr }));
  });
}

function localBackend(root) {
  const resolvedRoot = path.resolve(root);
  const within = (rel) => {
    const abs = path.resolve(resolvedRoot, rel || '.');
    const relCheck = path.relative(resolvedRoot, abs);
    if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) throw new Error(`path escapes the workspace: ${rel}`);
    return abs;
  };
  return {
    kind: 'local',
    root: resolvedRoot,
    async listDir(rel) {
      const entries = await fs.promises.readdir(within(rel), { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
      }));
    },
    readText(rel) {
      return fs.promises.readFile(within(rel), 'utf8');
    },
    async writeText(rel, text) {
      const abs = within(rel);
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      await fs.promises.writeFile(abs, text, 'utf8');
      return { path: rel, bytes: Buffer.byteLength(text, 'utf8') };
    },
    run(argv, opts = {}) {
      return runProcess(argv, { cwd: resolvedRoot, timeoutMs: opts.timeoutMs });
    },
    dispose() {},
  };
}

async function remoteBackend(ctx, route, options = {}) {
  const pool = ctx.get('sshPool');
  if (!pool || typeof pool.acquire !== 'function') {
    throw new Error('remote workspace detected, but the sshPool service is unavailable — install the dsh-ssh-toolkit bundle');
  }
  const hostConfig = typeof pool.getHost === 'function' ? pool.getHost(route.hostId) : undefined;
  if (!hostConfig) throw new Error(`SSH host "${route.hostId}" is not configured in dsh-ssh-hosts`);
  const conn = await pool.acquire({ ...hostConfig, id: route.hostId });
  const root = posix.normalize(route.remoteCwd);
  const within = (rel) => {
    const abs = posix.normalize(posix.join(root, rel || '.'));
    const base = root.endsWith('/') ? root : `${root}/`;
    if (abs !== root && !abs.startsWith(base)) throw new Error(`path escapes the workspace: ${rel}`);
    return abs;
  };
  const fsApi = await conn.fs();
  return {
    kind: 'remote',
    root,
    async listDir(rel) {
      const entries = await fsApi.listDir(within(rel));
      return entries.map((entry) => ({
        name: entry.name,
        type: entry.type === 'dir' ? 'directory' : entry.type === 'file' ? 'file' : 'other',
      }));
    },
    readText(rel) {
      return fsApi.readText(within(rel));
    },
    async writeText(rel, text) {
      const abs = within(rel);
      await fsApi.writeFileAtomic(abs, text);
      return { path: rel, bytes: Buffer.byteLength(text, 'utf8') };
    },
    async run(argv, opts = {}) {
      const commandLine = argv.map(shellQuote).join(' ');
      const script = `cd ${shellQuote(root)} && ${commandLine}`;
      const command = options.remoteWrapper ? `${options.remoteWrapper} ${shellQuote(script)}` : script;
      const result = await conn.exec(command, { timeoutMs: opts.timeoutMs ?? 180000, maxStdoutBytes: 8 * 1024 * 1024 });
      return { code: result.code, stdout: result.stdout, stderr: result.stderr };
    },
    dispose() {
      try {
        pool.release();
      } catch { /* pool already released */ }
    },
  };
}

export { localBackend, remoteBackend, runProcess, SKIP_DIRS };
