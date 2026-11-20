#!/usr/bin/env node
/**
 * Service-level smoke test: drives the Host capability with a fake Cordis
 * context over a real project directory (local backend only, no DSH needed).
 *
 *   node scripts/service-smoke.mjs <project-dir>
 */
import { createLatexService } from '../src/host/service.js';

const root = process.argv[2];
if (!root) {
  console.error('usage: node scripts/service-smoke.mjs <project-dir>');
  process.exit(2);
}

const sessionId = 'smoke-session';
const ctx = {
  get(name) {
    if (name === 'sessions') return { get: (id) => (id === sessionId ? { header: { cwd: root } } : undefined) };
    return undefined;
  },
  logger: { info() {}, error() {} },
};

const service = createLatexService(ctx, { engine: 'pdflatex', maxPasses: 4 });
const report = { steps: [] };

const discovery = await service.discover(sessionId, '');
report.discover = {
  workspace: discovery.workspace,
  reason: discovery.reason,
  files: discovery.files.length,
  projects: discovery.projects.map((project) => ({ root: project.root, main: project.main, files: project.files.length })),
};
const project = discovery.projects.find((entry) => entry.main);
if (!project) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

const main = project.main;
const read = await service.readFile(sessionId, main);
report.read = { path: read.path, bytes: read.text.length, head: read.text.slice(0, 40).replace(/\n/g, '\\n') };

let containment = 'ok';
try {
  await service.readFile(sessionId, '../outside.tex');
  containment = 'NOT BLOCKED';
} catch (error) {
  containment = /escapes/.test(String(error && error.message)) ? 'blocked' : `unexpected: ${error.message}`;
}
report.containment = containment;

const compile = await service.compile(sessionId, main, 'pdflatex');
report.compile = {
  ok: compile.ok,
  pdf: compile.pdf,
  passes: compile.passes,
  pages: compile.pages,
  errors: compile.errors,
  warnings: compile.warnings.slice(0, 3),
  durationMs: compile.durationMs,
  steps: compile.steps,
};
report.status = service.status(sessionId);

console.log(JSON.stringify(report, null, 2));
process.exit(compile.ok ? 0 : 1);
