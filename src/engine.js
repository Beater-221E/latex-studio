/**
 * Pure LaTeX project logic shared by the Host plugin and the tests.
 *
 * Nothing here touches Node or DSH: main-file detection, dependency scanning
 * and log parsing are string work, so the same rules serve local and remote
 * workspaces and can be unit-tested without a DSH installation.
 */

/** Longest head of a `.tex` file the main-file detector needs. */
export const HEAD_LIMIT = 8192;

const NAME_HINTS = ['main', 'paper', 'ms', 'manuscript', 'root', 'thesis', 'report', 'article', 'draft', 'template'];
const TEXT_FILE_RE = /\.(?:tex|ltx|cls|sty|bib|bbl|def|cfg|fd|ist|aux|log)$/i;

export function toPosix(value) {
  return String(value ?? '').replace(/\\/g, '/');
}

export function dirnamePosix(relPath) {
  const text = toPosix(relPath);
  const index = text.lastIndexOf('/');
  return index === -1 ? '' : text.slice(0, index);
}

export function basenamePosix(relPath) {
  const text = toPosix(relPath);
  const index = text.lastIndexOf('/');
  return index === -1 ? text : text.slice(index + 1);
}

/** Join POSIX-ish relative segments, folding `.` and `..` lexically. */
export function joinPosix(...parts) {
  const out = [];
  for (const part of parts) {
    if (part === undefined || part === null || part === '') continue;
    for (const segment of toPosix(part).split('/')) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') {
        out.pop();
        continue;
      }
      out.push(segment);
    }
  }
  return out.join('/');
}

/** Normalize a workspace-relative path and refuse anything escaping the root. */
export function normalizeRel(relPath) {
  const out = [];
  for (const segment of toPosix(relPath).split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (out.length === 0) throw new Error(`path escapes the workspace: ${relPath}`);
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join('/');
}

export function stripTexExt(value) {
  return toPosix(value).replace(/\.tex$/i, '');
}

/** The `% !TEX root = ../main.tex` magic comment, if present in a file head. */
export function matchTexRoot(head) {
  const match = /^[ \t]*%[ \t]*!TEX[ \t]+root[ \t]*=[ \t]*(.+?)[ \t]*$/im.exec(String(head ?? ''));
  if (!match) return null;
  return match[1].replace(/^["']|["']$/g, '').trim() || null;
}

/** A real preamble declaration, not a mention inside prose or a comment line. */
export function hasDocumentClass(head) {
  return /^[ \t]*\\documentclass\b/m.test(String(head ?? ''));
}

function candidateScore(relPath, head) {
  const posix = toPosix(relPath);
  const base = stripTexExt(basenamePosix(posix)).toLowerCase();
  const depth = dirnamePosix(posix) === '' ? 0 : dirnamePosix(posix).split('/').length;
  let score = 0;
  if (base === 'main') score += 60;
  else if (NAME_HINTS.includes(base)) score += 35;
  score += Math.max(0, 24 - depth * 8);
  if (/\\begin\{document\}/.test(head)) score += 30;
  if (/\\end\{document\}/.test(head)) score += 5;
  if (/\\(?:title|maketitle)\b/.test(head)) score += 5;
  if (/\\(?:input|include)\b/.test(head)) score += 5;
  if (/\\documentclass\[[^\]]*\]\{beamer\}/.test(head)) score -= 5;
  return score;
}

/**
 * Pick the project's main `.tex` file.
 *
 * A `% !TEX root` comment wins outright; otherwise files carrying
 * `\documentclass` are ranked by name hint, depth and project structure.
 *
 * @param {Record<string, string>} heads - project-relative path -> file head.
 * @returns {{main: string|null, candidates: Array<{path: string, score: number, reason: string}>, reason: string}}
 */
export function detectMainFile(heads) {
  const entries = Object.entries(heads ?? {}).map(([relPath, head]) => [toPosix(relPath), String(head ?? '')]);

  for (const [relPath, head] of entries) {
    const root = matchTexRoot(head);
    if (root) {
      const target = joinPosix(dirnamePosix(relPath), root);
      return {
        main: target,
        candidates: [{ path: target, score: 100, reason: 'tex-root-comment' }],
        reason: 'tex-root-comment',
      };
    }
  }

  const candidates = entries
    .filter(([, head]) => hasDocumentClass(head))
    .map(([relPath, head]) => ({ path: relPath, score: candidateScore(relPath, head), reason: 'documentclass' }))
    .sort((a, b) => b.score - a.score || a.path.length - b.path.length || (a.path < b.path ? -1 : 1));

  if (candidates.length === 0) return { main: null, candidates: [], reason: 'no-documentclass' };
  return { main: candidates[0].path, candidates, reason: candidates[0].reason };
}

/**
 * Group candidate `.tex` heads by directory and rank the directories as
 * projects, so a workspace holding several papers offers a real choice.
 *
 * @param {string[]} texFiles - workspace-relative `.tex` paths.
 * @param {Record<string, string>} heads - workspace-relative path -> head.
 * @returns {Array<{root: string, main: string|null, files: string[], score: number}>}
 */
export function groupProjects(texFiles, heads) {
  const files = texFiles.map(toPosix);
  const anchorsByDir = new Map();
  for (const [relPath, head] of Object.entries(heads ?? {})) {
    const anchor = hasDocumentClass(head) || matchTexRoot(head) !== null;
    if (!anchor) continue;
    const dir = dirnamePosix(relPath);
    if (!anchorsByDir.has(dir)) anchorsByDir.set(dir, {});
    anchorsByDir.get(dir)[toPosix(relPath)] = head;
  }

  const projects = [];
  for (const [anchorDir, localHeads] of anchorsByDir) {
    const detection = detectMainFile(localHeads);
    const root = detection.main ? dirnamePosix(detection.main) : anchorDir;
    const projectFiles = files.filter((file) => root === '' || file === root || file.startsWith(`${root}/`));
    projects.push({
      root,
      main: detection.main,
      files: projectFiles,
      score: detection.candidates[0]?.score ?? 0,
    });
  }
  const deduped = new Map();
  for (const project of projects) {
    const previous = deduped.get(project.root);
    if (!previous || project.score > previous.score) deduped.set(project.root, project);
  }
  return [...deduped.values()].sort((a, b) => b.score - a.score || a.root.length - b.root.length || (a.root < b.root ? -1 : 1));
}

/**
 * Files a document pulls in, so the plugin can name what it built.
 * The result is advisory: missing entries are filtered by the caller.
 *
 * @param {string} text - `.tex` source.
 * @returns {Array<{kind: string, value: string}>}
 */
export function scanDependencies(text) {
  const source = String(text ?? '');
  const found = [];
  const patterns = [
    { kind: 'input', re: /\\(?:input|include|subfile|import)\s*\{([^}]+)\}/g },
    { kind: 'bibliography', re: /\\(?:bibliography|addbibresource|addglobalbib)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g },
    { kind: 'graphics', re: /\\(?:includegraphics|includesvg)\*?\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g },
    { kind: 'package', re: /\\(?:usepackage|RequirePackage|documentclass)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g },
  ];
  for (const { kind, re } of patterns) {
    let match;
    while ((match = re.exec(source)) !== null) {
      for (const piece of match[1].split(',')) {
        const value = piece.trim();
        if (value) found.push({ kind, value });
      }
    }
  }
  return found;
}

function cleanTexPath(value) {
  return toPosix(value).replace(/^\.\//, '');
}

function emptyParse() {
  return {
    errors: [],
    warnings: [],
    missingFiles: [],
    undefinedRefs: [],
    rerun: false,
    pages: null,
    overfull: 0,
    underfull: 0,
  };
}

/**
 * Parse a `pdflatex`/`latexmk` transcript into actionable diagnostics.
 *
 * Understands `-file-line-error` lines, classic `! ...` blocks with their
 * `l.<n>` follow-up, missing `.sty`/`.bbl` files, undefined references and the
 * usual rerun hints. Wrapped log lines are tolerated, not reassembled.
 *
 * @param {string} logText - contents of the main `.log` file.
 * @returns {ReturnType<typeof emptyParse>}
 */
export function parseLog(logText) {
  const parsed = emptyParse();
  const lines = String(logText ?? '').split(/\r?\n/);
  const seenErrors = new Set();
  const seenWarnings = new Set();
  let lastFile = null;

  const addError = (entry) => {
    const key = `${entry.file ?? ''}:${entry.line ?? ''}:${entry.message}`;
    if (seenErrors.has(key)) return;
    seenErrors.add(key);
    parsed.errors.push(entry);
  };
  const addWarning = (entry) => {
    const key = `${entry.file ?? ''}:${entry.line ?? ''}:${entry.message}`;
    if (seenWarnings.has(key)) return;
    seenWarnings.add(key);
    parsed.warnings.push(entry);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    // Remember which input file the transcript is currently expanding.
    const fileRe = /\(((?:\.{0,2}\/)?[^()\s]*?\.(?:tex|ltx))/g;
    let fileMatch;
    while ((fileMatch = fileRe.exec(line)) !== null) lastFile = cleanTexPath(fileMatch[1]);

    if (/^Overfull \\[hv]box/.test(line)) {
      parsed.overfull += 1;
      continue;
    }
    if (/^Underfull \\[hv]box/.test(line)) {
      parsed.underfull += 1;
      continue;
    }

    // -file-line-error: "./chap/intro.tex:34: Undefined control sequence."
    const fileLine = /^((?:[A-Za-z]:)?(?:\.{0,2}\/)?[^:\s][^:]*?\.(?:tex|ltx|cls|sty|bib|bbl)):(\d+):\s*(.+)$/.exec(line);
    if (fileLine) {
      const message = fileLine[3].trim();
      const file = cleanTexPath(fileLine[1]);
      const number = Number(fileLine[2]);
      addError({ file, line: number, message });
      const missing = /^LaTeX Error: File `([^']+)' not found/.exec(message) || /^File `([^']+)' not found/.exec(message);
      if (missing) parsed.missingFiles.push(missing[1]);
      if (/undefined/i.test(message) && /(?:Reference|Citation)/i.test(message)) {
        parsed.undefinedRefs.push({ file, line: number, message });
      }
      continue;
    }

    // Classic transcript: "! Undefined control sequence." then "l.12 \foo".
    if (line.startsWith('!')) {
      const message = line.replace(/^!\s*/, '').trim();
      if (!message) continue;
      const missing = /^LaTeX Error: File `([^']+)' not found/.exec(message) || /^I can't find file `([^']+)'/.exec(message);
      if (missing) parsed.missingFiles.push(missing[1]);
      let number = null;
      for (let look = index + 1; look < Math.min(lines.length, index + 8); look += 1) {
        const lMatch = /^l\.(\d+)/.exec(lines[look]);
        if (lMatch) {
          number = Number(lMatch[1]);
          break;
        }
      }
      addError({ file: lastFile, line: number, message });
      continue;
    }

    // Missing auxiliary files are not errors but explain a later rerun.
    const noFile = /^No file ([^\s.]+\.(?:bbl|aux|toc|out|ind|idx))/.exec(line);
    if (noFile) {
      parsed.missingFiles.push(noFile[1]);
      continue;
    }

    if (/^LaTeX Warning:/.test(line) || /^(?:Package|Class|LaTeX Font) [^\s]+ Warning:/.test(line)) {
      const message = line
        .replace(/^LaTeX Warning:\s*/, '')
        .replace(/^(?:Package|Class|LaTeX Font) [^\s]+ Warning:\s*/, '')
        .trim();
      const number = /on input line (\d+)/.exec(line);
      const undefinedMatch = /^(Reference|Citation) `([^']+)' .*?undefined/.exec(message);
      if (undefinedMatch) {
        parsed.undefinedRefs.push({
          file: lastFile,
          line: number ? Number(number[1]) : null,
          message,
        });
      }
      addWarning({ file: lastFile, line: number ? Number(number[1]) : null, message });
      continue;
    }

    if (/Rerun to get|Label\(s\) may have changed|Rerun LaTeX|Please rerun LaTeX|There were undefined references/.test(line)) {
      parsed.rerun = true;
    }

    const output = /Output written on .*?\((\d+) pages?/.exec(line);
    if (output) parsed.pages = Number(output[1]);
  }

  parsed.missingFiles = [...new Set(parsed.missingFiles)];
  return parsed;
}
