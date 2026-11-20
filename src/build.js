/**
 * Project-level build orchestration: run the TeX engine, run the bibliography
 * tool exactly once when the document asks for one, and stop when the
 * cross-reference state settles. The caller supplies the process runner and
 * the file reader, so the same loop drives local and remote workspaces.
 */
import { stripTexExt, parseLog } from './engine.js';

const ENGINE_FLAGS = ['-interaction=nonstopmode', '-file-line-error', '-synctex=1'];
const ENGINES = ['pdflatex', 'xelatex', 'lualatex', 'latex'];

/** Accept only the engines this plugin can drive; fall back to pdflatex. */
export function normalizeEngine(value) {
  const engine = String(value ?? '').trim().toLowerCase();
  return ENGINES.includes(engine) ? engine : 'pdflatex';
}

function emptyParsed() {
  return { errors: [], warnings: [], missingFiles: [], undefinedRefs: [], rerun: false, pages: null, overfull: 0, underfull: 0 };
}

/**
 * Build one LaTeX project to PDF.
 *
 * @param {object} request
 * @param {string} request.root - project directory relative to the workspace.
 * @param {string} request.main - main `.tex` file relative to `root`.
 * @param {string} [request.engine] - engine name.
 * @param {number} [request.maxPasses] - hard cap on engine passes.
 * @param {number} [request.timeoutMs] - timeout of one process.
 * @param {(argv: string[], options: {timeoutMs: number}) => Promise<{code: number|null, stdout?: string, stderr?: string}>} request.run
 * @param {(relPath: string) => Promise<string|null>} request.readText - reads a file relative to `root`.
 * @param {(step: {pass: number, phase: string, code?: number|null}) => void} [request.onStep]
 * @returns {Promise<object>} build result with PDF path, diagnostics and transcript tail.
 */
export async function buildProject(request) {
  const {
    root = '',
    main,
    engine = 'pdflatex',
    maxPasses = 4,
    timeoutMs = 180000,
    run,
    readText,
    onStep,
  } = request;

  if (typeof run !== 'function') throw new Error('buildProject needs a run(argv, options) function');
  if (typeof readText !== 'function') throw new Error('buildProject needs a readText(relPath) function');
  if (!main) throw new Error('buildProject needs a main .tex file');

  const started = Date.now();
  const engineName = normalizeEngine(engine);
  const mainBase = stripTexExt(main);
  const steps = [];
  let parsed = emptyParsed();
  let transcript = '';
  let passes = 0;
  let bibliographyDone = false;
  let previousAux = null;
  let producedPdf = false;
  let failure = null;

  while (passes < Math.max(1, maxPasses)) {
    passes += 1;
    onStep?.({ pass: passes, phase: 'typeset' });
    const result = await run([engineName, ...ENGINE_FLAGS, main], { timeoutMs });
    transcript = (await readText(`${mainBase}.log`)) ?? '';
    parsed = parseLog(transcript);
    producedPdf = parsed.pages !== null || producedPdf;
    steps.push({ pass: passes, phase: 'typeset', code: result?.code ?? null, errors: parsed.errors.length });

    if (result && result.code !== 0 && parsed.errors.length === 0) {
      parsed.errors.push({
        file: main,
        line: null,
        message: `${engineName} exited with code ${result.code}${result.stderr ? `: ${String(result.stderr).trim().slice(0, 400)}` : ''}`,
      });
    }

    const aux = await readText(`${mainBase}.aux`);

    // BibTeX/Biber runs once, after the first pass has written the .aux.
    if (!bibliographyDone && needsBibliography(aux, parsed)) {
      bibliographyDone = true;
      const tool = usesBiber(transcript, aux) ? 'biber' : 'bibtex';
      onStep?.({ pass: passes, phase: tool });
      const bib = await run([tool, mainBase], { timeoutMs: Math.min(timeoutMs, 60000) });
      steps.push({ pass: passes, phase: tool, code: bib?.code ?? null });
      if (bib && bib.code !== 0) {
        parsed.warnings.push({
          file: `${mainBase}.bbl`,
          line: null,
          message: `${tool} exited with code ${bib.code}; bibliography may be incomplete`,
        });
      }
      previousAux = null;
      continue;
    }

    if (!producedPdf && result && result.code !== 0) {
      failure = `compilation failed before producing a PDF (pass ${passes})`;
      steps.push({ pass: passes, phase: 'failed', code: result.code });
      break;
    }

    const settled = aux !== null && aux === previousAux;
    previousAux = aux;
    if (settled && !parsed.rerun && passes >= 2) break;
    if (!parsed.rerun && passes >= 3 && settled) break;
  }

  const pdf = producedPdf ? `${mainBase}.pdf` : null;
  return {
    ok: pdf !== null,
    root,
    main,
    engine: engineName,
    pdf,
    passes,
    steps,
    errors: parsed.errors,
    warnings: parsed.warnings,
    missingFiles: parsed.missingFiles,
    undefinedRefs: parsed.undefinedRefs,
    pages: parsed.pages,
    overfull: parsed.overfull,
    underfull: parsed.underfull,
    durationMs: Date.now() - started,
    failure,
    logTail: transcript.slice(-12000),
  };
}

function needsBibliography(aux, parsed) {
  if (aux && /\\bibdata\{/.test(aux)) return true;
  if (aux && /\\abx@aux@(?:cite|ref)/.test(aux)) return true;
  if (parsed.missingFiles.some((file) => /\.bbl$/i.test(file))) return true;
  return false;
}

function usesBiber(transcript, aux) {
  return /biblatex/i.test(transcript) || (aux ? /\\abx@aux@/.test(aux) : false);
}
