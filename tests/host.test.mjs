import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  encodeRemotePath,
  decodeRemotePath,
  mapLocalToRemote,
  routeByCwd,
  remoteRoot,
  isValidHostId,
} from '../src/host/paths.js';
import { createLatexService } from '../src/host/service.js';
import { apply } from '../index.js';

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

function fakeContext() {
  const state = { service: null, typert: null, effects: 0 };
  const ctx = {
    effect(fn) {
      state.effects += 1;
      fn();
      return () => {};
    },
    provide(name, value) {
      if (name === 'latexStudio') state.service = value;
      return () => {};
    },
    inject(_deps, callback) {
      callback({ typert: { register(contribution) { state.typert = contribution; } } });
    },
    get() {
      return undefined;
    },
    logger: { info() {}, error() {} },
  };
  return { ctx, state };
}

test('the host service exposes the visible Typert binding the gateway resolves', () => {
  const { ctx, state } = fakeContext();
  apply(ctx, {});

  assert.ok(state.service, 'latexStudio service was provided');
  assert.ok(state.typert, 'typert contribution was registered');
  const binding = state.service.typertRemote;
  assert.ok(binding, 'service has a typertRemote binding');
  assert.equal(binding.service, state.service);
  assert.equal(binding.serviceKey, 'latexStudio');
  assert.equal(binding.namespace, 'latex');
  assert.ok(Object.isFrozen(binding));
});

test('the registered Typert contribution covers every RPC the Client mounts', () => {
  const { ctx, state } = fakeContext();
  apply(ctx, {});

  const endpoints = new Set(state.typert.invocations.map((item) => `${item.namespace}/${item.method}`));
  for (const method of ['discover', 'readFile', 'readBytes', 'writeFile', 'compile', 'listDir', 'pickDirectory', 'sshHosts', 'remoteHome', 'remoteList', 'publishFile']) {
    assert.ok(endpoints.has(`latex/${method}`), `missing endpoint latex/${method}`);
  }
});

function bytesWorkspace(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'latex-studio-bytes-'));
  for (const [name, data] of Object.entries(files)) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  return root;
}

function bytesHarness(root) {
  const sessionId = 'bytes-session';
  const ctx = {
    get(name) {
      if (name === 'sessions') return { get: (id) => (id === sessionId ? { header: { cwd: root } } : undefined) };
      return undefined;
    },
    logger: { info() {}, error() {} },
  };
  return { service: createLatexService(ctx, {}), sessionId };
}

const BYTES_PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];

test('readBytes returns a PDF as base64 with its byte count', async () => {
  const root = bytesWorkspace({ 'main.pdf': Buffer.from(BYTES_PDF) });
  const { service, sessionId } = bytesHarness(root);

  const result = await service.readBytes(sessionId, 'main.pdf');

  assert.equal(result.path, 'main.pdf');
  assert.equal(result.bytes, BYTES_PDF.length);
  assert.deepEqual([...Buffer.from(result.base64, 'base64')], BYTES_PDF);
});

test('readBytes reads a PDF in a subdirectory, relative to the workspace', async () => {
  const root = bytesWorkspace({ 'build/out/main.pdf': Buffer.from(BYTES_PDF) });
  const { service, sessionId } = bytesHarness(root);

  const result = await service.readBytes(sessionId, 'build/out/main.pdf');

  assert.equal(result.path, 'build/out/main.pdf');
  assert.deepEqual([...Buffer.from(result.base64, 'base64')], BYTES_PDF);
});

test('readBytes refuses non-PDF files so it cannot act as a generic reader', async () => {
  const root = bytesWorkspace({ 'main.tex': Buffer.from('hello') });
  const { service, sessionId } = bytesHarness(root);

  await assert.rejects(service.readBytes(sessionId, 'main.tex'), /only PDF files/);
});

test('readBytes keeps the workspace containment', async () => {
  const root = bytesWorkspace({ 'main.pdf': Buffer.from(BYTES_PDF) });
  const { service, sessionId } = bytesHarness(root);

  await assert.rejects(service.readBytes(sessionId, '../escape.pdf'), /escapes the workspace/);
});

test('readBytes reports a missing PDF', async () => {
  const root = bytesWorkspace({ 'main.tex': Buffer.from('hello') });
  const { service, sessionId } = bytesHarness(root);

  await assert.rejects(service.readBytes(sessionId, 'missing.pdf'), /ENOENT/);
});

const PROJECT_PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];

function projectDir(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'latex-studio-project-'));
  for (const [name, data] of Object.entries(files)) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  return root;
}

function projectHarness() {
  const ctx = {
    get() {
      return undefined;
    },
    logger: { info() {}, error() {} },
  };
  return { service: createLatexService(ctx, {}), sessionId: 'project-session' };
}

test('an opened local project is routed by its own root, outside the session workspace', async () => {
  const root = projectDir({ 'build/main.pdf': Buffer.from(PROJECT_PDF), 'paper/main.tex': '\\documentclass{article}' });
  const { service, sessionId } = projectHarness();

  const bytes = await service.readBytes(sessionId, 'build/main.pdf', { kind: 'local', root });
  assert.deepEqual([...Buffer.from(bytes.base64, 'base64')], PROJECT_PDF);

  const discovery = await service.discover(sessionId, '', { kind: 'local', root });
  assert.equal(discovery.workspace, 'local');
  assert.ok(discovery.files.includes('paper/main.tex'));
  assert.equal(discovery.projects[0].main, 'paper/main.tex');
});

test('a project root must be absolute', async () => {
  const { service, sessionId } = projectHarness();
  await assert.rejects(
    service.discover(sessionId, '', { kind: 'local', root: 'relative/dir' }),
    /absolute path/,
  );
});

test('a remote project needs the ssh toolkit service', async () => {
  const { service, sessionId } = projectHarness();
  await assert.rejects(
    service.discover(sessionId, '', { kind: 'remote', hostId: 'ucsd', root: '/home/user/paper' }),
    /dsh-ssh-toolkit/,
  );
});

test('picking a directory without a picker installed fails clearly', async () => {
  const { service } = projectHarness();
  await assert.rejects(service.pickDirectory(), /directory picker/);
});

test('sshHosts is empty when the toolkit is absent', async () => {
  const { service } = projectHarness();
  assert.deepEqual(await service.sshHosts(), { hosts: [] });
});
