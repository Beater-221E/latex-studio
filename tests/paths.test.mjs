import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  encodeRemotePath,
  decodeRemotePath,
  mapLocalToRemote,
  routeByCwd,
  remoteRoot,
  isValidHostId,
} from '../src/host/paths.js';

const env = { DSH_HOME: path.join('/tmp', 'dsh-home') };
const placeholderRoot = remoteRoot(env);

test('remote placeholder round-trips a remote absolute path', () => {
  const remotePath = '/dsmlp/home-fs03/65/265/yuw332/aaai_mi_in_ad';
  const encoded = encodeRemotePath(remotePath);
  assert.equal(decodeRemotePath(encoded), remotePath);
  assert.equal(decodeRemotePath('not base64!!'), null);
});

test('routeByCwd classifies a local directory as local', () => {
  const route = routeByCwd(path.join('/tmp', 'papers', 'main'), env);
  assert.equal(route.kind, 'local');
  assert.equal(route.root, path.join('/tmp', 'papers', 'main'));
});

test('routeByCwd decodes a placeholder into host and remote path', () => {
  const remotePath = '/dsmlp/home-fs03/65/265/yuw332/paper';
  const placeholder = path.join(placeholderRoot, 'ucsd', encodeRemotePath(remotePath));
  const route = routeByCwd(placeholder, env);
  assert.equal(route.kind, 'remote');
  assert.equal(route.hostId, 'ucsd');
  assert.equal(route.remoteCwd, remotePath);
});

test('placeholder mapping refuses traversal and malformed host ids', () => {
  assert.equal(isValidHostId('../evil'), false);
  assert.equal(isValidHostId('ucsd'), true);
  const remotePath = '/srv/paper';
  const placeholder = path.join(placeholderRoot, 'ucsd', `${encodeRemotePath(remotePath)}`);
  assert.deepEqual(mapLocalToRemote(placeholder, env), { hostId: 'ucsd', remotePath });
  assert.equal(mapLocalToRemote(path.join(placeholderRoot, 'ucsd'), env), null);
  assert.equal(mapLocalToRemote(path.join('/tmp', 'elsewhere'), env), null);
});
