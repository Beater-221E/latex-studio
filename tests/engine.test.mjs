import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectMainFile,
  groupProjects,
  parseLog,
  scanDependencies,
  joinPosix,
  normalizeRel,
  matchTexRoot,
} from '../src/engine.js';

const MAIN_HEAD = String.raw`\documentclass[11pt]{article}
\usepackage{amsmath}
\title{A paper}
\begin{document}
\input{sections/intro}
`;
const CHAPTER_HEAD = String.raw`\section{Introduction}
This chapter has no preamble and no \documentclass.
`;
const OTHER_PAPER_HEAD = String.raw`\documentclass{aaai27}
\begin{document}
Hello
\end{document}
`;

test('joinPosix folds dot segments and keeps relative paths relative', () => {
  assert.equal(joinPosix('sections', '..', 'main.tex'), 'main.tex');
  assert.equal(joinPosix('', 'paper', 'main.tex'), 'paper/main.tex');
  assert.equal(joinPosix('a', '.', 'b'), 'a/b');
});

test('normalizeRel refuses paths escaping the workspace', () => {
  assert.equal(normalizeRel('paper/main.tex'), 'paper/main.tex');
  assert.throws(() => normalizeRel('../outside.tex'), /escapes/);
});

test('matchTexRoot reads the magic comment', () => {
  assert.equal(matchTexRoot('% !TEX root = ../main.tex'), '../main.tex');
  assert.equal(matchTexRoot('  %!TEX root=main.tex'), 'main.tex');
  assert.equal(matchTexRoot('\\documentclass{article}'), null);
});

test('detectMainFile prefers the file with documentclass over chapter files', () => {
  const detection = detectMainFile({
    'main.tex': MAIN_HEAD,
    'sections/intro.tex': CHAPTER_HEAD,
  });
  assert.equal(detection.main, 'main.tex');
  assert.equal(detection.reason, 'documentclass');
});

test('detectMainFile lets a % !TEX root comment win', () => {
  const detection = detectMainFile({
    'paper.tex': MAIN_HEAD,
    'sections/intro.tex': '% !TEX root = ../paper.tex\n\\section{Intro}\n',
  });
  assert.equal(detection.main, 'paper.tex');
  assert.equal(detection.reason, 'tex-root-comment');
});

test('detectMainFile reports when nothing carries a preamble', () => {
  const detection = detectMainFile({ 'sections/a.tex': CHAPTER_HEAD });
  assert.equal(detection.main, null);
  assert.equal(detection.reason, 'no-documentclass');
});

test('groupProjects separates two papers in one workspace', () => {
  const projects = groupProjects(
    ['paperA/main.tex', 'paperA/sections/intro.tex', 'paperB/paper.tex', 'paperB/refs.tex'],
    {
      'paperA/main.tex': MAIN_HEAD,
      'paperA/sections/intro.tex': CHAPTER_HEAD,
      'paperB/paper.tex': OTHER_PAPER_HEAD,
      'paperB/refs.tex': 'only bibliography data',
    },
  );
  assert.equal(projects.length, 2);
  assert.equal(projects[0].root, 'paperA');
  assert.equal(projects[0].main, 'paperA/main.tex');
  assert.deepEqual(projects[0].files.sort(), ['paperA/main.tex', 'paperA/sections/intro.tex']);
  assert.equal(projects[1].main, 'paperB/paper.tex');
});

test('scanDependencies finds inputs, bibliography and graphics', () => {
  const found = scanDependencies(String.raw`
    \documentclass{article}
    \usepackage{amsmath, graphicx}
    \input{sections/intro}
    \include{appendix}
    \bibliography{refs, extra}
    \addbibresource{more.bib}
    \includegraphics[width=\linewidth]{figures/plot.pdf}
  `);
  const values = found.map((entry) => `${entry.kind}:${entry.value}`);
  assert.ok(values.includes('input:sections/intro'));
  assert.ok(values.includes('input:appendix'));
  assert.ok(values.includes('bibliography:refs'));
  assert.ok(values.includes('bibliography:extra'));
  assert.ok(values.includes('bibliography:more.bib'));
  assert.ok(values.includes('graphics:figures/plot.pdf'));
  assert.ok(values.includes('package:amsmath'));
});

test('parseLog reads file-line errors, missing files and rerun hints', () => {
  const log = [
    'This is pdfTeX, Version 3.141592653',
    '(./main.tex',
    'LaTeX Font Info:    Checking defaults for OML/cmm/m/it on input line 12.',
    './main.tex:12: Undefined control sequence.',
    'l.12 \\foo',
    'The control sequence at the end of the top line',
    '! LaTeX Error: File `missingpkg.sty\' not found.',
    '! Emergency stop.',
    'No file main.bbl.',
    'LaTeX Warning: Reference `sec:intro\' on page 1 undefined on input line 20.',
    'LaTeX Warning: Citation `knuth\' on page 1 undefined on input line 21.',
    'There were undefined references.',
    'Rerun to get cross-references right.',
    '(./sections/body.tex',
    'sections/body.tex:7: Missing $ inserted.',
    'Output written on main.pdf (10 pages, 1953429 bytes).',
  ].join('\n');

  const parsed = parseLog(log);
  assert.equal(parsed.errors.length, 4, `unexpected errors: ${JSON.stringify(parsed.errors)}`);
  assert.equal(parsed.errors[0].file, 'main.tex');
  assert.equal(parsed.errors[0].line, 12);
  assert.match(parsed.errors[0].message, /Undefined control sequence/);
  assert.ok(parsed.errors.some((entry) => /missingpkg\.sty/.test(entry.message)));
  assert.equal(parsed.errors[3].file, 'sections/body.tex');
  assert.equal(parsed.errors[3].line, 7);
  assert.deepEqual(parsed.missingFiles.sort(), ['main.bbl', 'missingpkg.sty']);
  assert.equal(parsed.undefinedRefs.length, 2);
  assert.equal(parsed.rerun, true);
  assert.equal(parsed.pages, 10);
  assert.equal(parsed.warnings.length >= 2, true);
});

test('parseLog keeps a clean build clean', () => {
  const parsed = parseLog([
    '(./main.tex',
    'Output written on main.pdf (3 pages, 40000 bytes).',
  ].join('\n'));
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.rerun, false);
  assert.equal(parsed.pages, 3);
});
