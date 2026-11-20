#!/usr/bin/env node
/**
 * Smoke test for the build engine against a real project on this machine.
 *
 *   node scripts/build-smoke.mjs <project-dir> [main.tex]
 *
 * Prints the build summary as JSON: passes, PDF, errors, warnings, duration.
 * Used during development inside the DSH remote workspace.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { buildProject } from '../src/build.js';
import { detectMainFile, HEAD_LIMIT } from '../src/engine.js';

const projectDir = path.resolve(process.argv[2] || '.');
const explicitMain = process.argv[3];

function run(argv, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), { cwd: projectDir, windowsHide: true, shell: false });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }, options.timeoutMs || 180000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(error && error.message ? error.message : error) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function readText(relPath) {
  try {
    return fs.readFileSync(path.join(projectDir, relPath), 'utf8');
  } catch {
    return null;
  }
}

function pickMain() {
  if (explicitMain) return explicitMain;
  const heads = {};
  for (const entry of fs.readdirSync(projectDir)) {
    if (!/\.tex$/i.test(entry)) continue;
    heads[entry] = fs.readFileSync(path.join(projectDir, entry), 'utf8').slice(0, HEAD_LIMIT);
  }
  const detection = detectMainFile(heads);
  if (!detection.main) throw new Error(`no main .tex found in ${projectDir}`);
  return detection.main;
}

const main = pickMain();
const result = await buildProject({
  root: '',
  main,
  engine: process.env.LATEX_ENGINE || 'pdflatex',
  run,
  readText,
});

console.log(JSON.stringify({
  projectDir,
  main,
  ok: result.ok,
  pdf: result.pdf,
  passes: result.passes,
  pages: result.pages,
  durationMs: result.durationMs,
  errors: result.errors.slice(0, 10),
  warnings: result.warnings.slice(0, 5),
  missingFiles: result.missingFiles,
  steps: result.steps,
}, null, 2));

process.exit(result.ok ? 0 : 1);
