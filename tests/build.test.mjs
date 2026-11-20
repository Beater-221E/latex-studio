import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProject, normalizeEngine } from '../src/build.js';

/** A scripted runner: records every command and replays canned transcript/aux. */
function scriptedRunner(options = {}) {
  const calls = [];
  let auxValue = options.aux ?? '\\bibdata{refs}\n';
  let passCount = 0;
  const logs = options.logs ?? [];
  return {
    calls,
    async run(argv, runOptions) {
      calls.push({ argv, timeoutMs: runOptions && runOptions.timeoutMs });
      if (!/pdflatex|xelatex|lualatex|latex$/.test(argv[0]) || argv[0] === 'latexmk') {
        return { code: 0, stdout: '', stderr: '' };
      }
      passCount += 1;
      return { code: 0, stdout: '', stderr: '' };
    },
    readText(relPath) {
      if (relPath.endsWith('.log')) {
        const index = Math.min(passCount - 1, logs.length - 1);
        return logs[Math.max(0, index)] ?? logs[0] ?? '';
      }
      if (relPath.endsWith('.aux')) return auxValue;
      return null;
    },
  };
}

const CLEAN_LOG = 'Output written on main.pdf (2 pages, 1000 bytes).\n';

test('normalizeEngine falls back to pdflatex', () => {
  assert.equal(normalizeEngine('xelatex'), 'xelatex');
  assert.equal(normalizeEngine('pdflatex'), 'pdflatex');
  assert.equal(normalizeEngine('nonsense'), 'pdflatex');
  assert.equal(normalizeEngine(undefined), 'pdflatex');
});

test('buildProject stops once the aux settles', async () => {
  const runner = scriptedRunner({ logs: [CLEAN_LOG], aux: '' });
  const result = await buildProject({
    root: 'paper',
    main: 'main.tex',
    run: (argv, options) => runner.run(argv, options),
    readText: (relPath) => runner.readText(relPath),
  });
  assert.equal(result.ok, true);
  assert.equal(result.pdf, 'main.pdf');
  assert.equal(result.passes, 2);
  assert.equal(runner.calls.filter((call) => call.argv[0] === 'pdflatex').length, 2);
});

test('buildProject runs bibtex once when the aux asks for it', async () => {
  const runner = scriptedRunner({ logs: [CLEAN_LOG], aux: '\\bibdata{refs}\n' });
  const result = await buildProject({
    root: 'paper',
    main: 'main.tex',
    run: (argv, options) => runner.run(argv, options),
    readText: (relPath) => runner.readText(relPath),
  });
  const bibCalls = runner.calls.filter((call) => call.argv[0] === 'bibtex');
  assert.equal(bibCalls.length, 1, 'bibliography runs exactly once');
  assert.equal(bibCalls[0].argv[1], 'main');
  assert.equal(result.passes, 3);
});

test('buildProject reports errors from the transcript', async () => {
  const log = [
    'main.tex:12: Undefined control sequence.',
    'l.12 \\foo',
    'Output written on main.pdf (1 page, 1000 bytes).',
  ].join('\n');
  const runner = scriptedRunner({ logs: [log], aux: '' });
  const result = await buildProject({
    root: '',
    main: 'main.tex',
    run: (argv, options) => runner.run(argv, options),
    readText: (relPath) => runner.readText(relPath),
  });
  assert.equal(result.ok, true, 'a PDF with recoverable errors still counts as produced');
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].line, 12);
  assert.equal(result.pdf, 'main.pdf');
});
