/**
 * SSH placeholder mapping shared with the remote-workspace bundle.
 *
 * A remote workspace is a local placeholder directory named
 * `<root>/<hostId>/<base64url(absolute remote path)>`. The mapping is
 * reversible and pure, so the Host plugin can tell a local project from a
 * remote one without asking another plugin.
 */
import os from 'node:os';
import path from 'node:path';

/** Placeholder root: DSH_SSH_REMOTE_ROOT > $DSH_HOME/remote > ~/.dsh/remote. */
export function remoteRoot(env = process.env) {
  if (env && env.DSH_SSH_REMOTE_ROOT) return path.resolve(String(env.DSH_SSH_REMOTE_ROOT));
  const home = env && env.DSH_HOME ? String(env.DSH_HOME) : path.join(os.homedir(), '.dsh');
  return path.join(home, 'remote');
}

export function isValidHostId(hostId) {
  if (typeof hostId !== 'string' || hostId.length === 0) return false;
  if (hostId === '.' || hostId === '..') return false;
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(hostId);
}

export function encodeRemotePath(remotePath) {
  return Buffer.from(String(remotePath), 'utf8').toString('base64url');
}

export function decodeRemotePath(encoded) {
  if (typeof encoded !== 'string' || encoded.length === 0) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  let text;
  try {
    text = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (encodeRemotePath(text) !== encoded) return null;
  return text;
}

/** Local placeholder path -> { hostId, remotePath } or null. */
export function mapLocalToRemote(localPath, env = process.env) {
  if (typeof localPath !== 'string' || localPath.length === 0) return null;
  const root = remoteRoot(env);
  const rel = path.relative(root, localPath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const segments = rel.split(path.sep);
  if (segments.length !== 2) return null;
  const [hostId, encoded] = segments;
  if (!isValidHostId(hostId)) return null;
  const remotePath = decodeRemotePath(encoded);
  if (remotePath === null || !path.isAbsolute(remotePath) || !remotePath.startsWith('/')) return null;
  return { hostId, remotePath };
}

/**
 * Route a session cwd.
 * @returns {{kind: 'local', root: string} | {kind: 'remote', hostId: string, remoteCwd: string}}
 */
export function routeByCwd(cwd, env = process.env) {
  const mapped = mapLocalToRemote(cwd, env);
  if (mapped === null) return { kind: 'local', root: cwd };
  return { kind: 'remote', hostId: mapped.hostId, remoteCwd: mapped.remotePath };
}
