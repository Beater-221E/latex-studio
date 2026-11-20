/**
 * LaTeX Studio — Client half.
 *
 * Registers a right-Sidebar page type ("LaTeX Studio") whose body is a small
 * project workspace: file list, source editor, compile control, diagnostics and
 * a link that opens the built PDF in the Sidebar's own preview (split pane).
 *
 * The factory must stay self-contained: the module loader resolves only the
 * browser module map (react, zod), never relative imports.
 */
window.__ModuleLoader__.load({
  id: '@local/latex-studio',
  factory(require) {
    const React = require('react');
    const zod = require('zod');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback, useMemo } = React;

    const TAB_ID = '@local/latex-studio';
    const KIND = 'latex-studio';
    const NS = 'latexStudio';
    const REMOTE_PACKAGE = '@local/latex-studio';
    const ENGINES = ['pdflatex', 'xelatex', 'lualatex'];

    // ── copy ────────────────────────────────────────────────────────────────
    const EN = {
      title: 'LaTeX Studio',
      compile: 'Compile',
      compiling: 'Compiling…',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved',
      openPdf: 'Open PDF',
      project: 'Project',
      mainFile: 'Main file',
      engine: 'Engine',
      files: 'Files',
      diagnostics: 'Diagnostics',
      log: 'Log',
      hideLog: 'Hide log',
      noErrors: 'No errors',
      warnings: 'warnings',
      errors: 'errors',
      pages: 'pages',
      passes: 'passes',
      seconds: 's',
      loading: 'Loading workspace…',
      noProject: 'No LaTeX project found in this workspace.',
      pickMain: 'Pick the main .tex file',
      chooseMain: 'Choose a main .tex file first.',
      discardEdits: 'Discard unsaved changes?',
      rescan: 'Rescan',
      unsaved: 'Unsaved changes',
      buildFailed: 'Build failed',
      requestFailed: 'LaTeX request failed',
      noFile: 'Select a file to edit',
      rootSuffix: '(workspace root)',
      missing: 'Missing files',
      openFailed: 'Could not open the PDF preview',
      hint: 'Compile builds the whole project: \\input, bibliography and multi-pass references included.',
      dirty: 'Unsaved',
      clean: 'Up to date',
    };
    const ZH = {
      title: 'LaTeX 工作台',
      compile: '编译',
      compiling: '编译中…',
      save: '保存',
      saving: '保存中…',
      saved: '已保存',
      openPdf: '打开 PDF',
      project: '项目',
      mainFile: '主文件',
      engine: '引擎',
      files: '文件',
      diagnostics: '诊断',
      log: '日志',
      hideLog: '收起日志',
      noErrors: '没有错误',
      warnings: '个警告',
      errors: '个错误',
      pages: '页',
      passes: '遍',
      seconds: '秒',
      loading: '正在读取工作区…',
      noProject: '这个工作区里没有找到 LaTeX 项目。',
      pickMain: '请选择主 .tex 文件',
      chooseMain: '请先选择一个主 .tex 文件。',
      discardEdits: '放弃未保存的修改？',
      rescan: '重新扫描',
      unsaved: '有未保存的修改',
      buildFailed: '编译失败',
      requestFailed: 'LaTeX 请求失败',
      noFile: '选择一个文件开始编辑',
      rootSuffix: '（工作区根目录）',
      missing: '缺失文件',
      openFailed: '无法打开 PDF 预览',
      hint: '编译按整个工程进行：包含 \\input、参考文献与多遍交叉引用。',
      dirty: '未保存',
      clean: '已保存',
    };

    // ── remote contract ────────────────────────────────────────────────────
    function strictCodec(typeSymbol) {
      return { mode: 'strict', typeSymbol, jsonSchema: {}, create: () => zod.z.any() };
    }
    function remoteDescriptor(method, params, resultType) {
      return {
        id: `${REMOTE_PACKAGE}#latex/${method}`,
        service: 'latexStudio',
        namespace: 'latex',
        method,
        invocation: { kind: 'direct' },
        parameters: params.map((name) => ({ name, wire: name, source: 'json', codec: strictCodec(`${REMOTE_PACKAGE}#${name}`) })),
        result: strictCodec(`${REMOTE_PACKAGE}#${resultType}`),
      };
    }
    const CLIENT_REMOTE = {
      package: REMOTE_PACKAGE,
      descriptors: [
        remoteDescriptor('discover', ['sessionId', 'projectPath'], 'DiscoverResult'),
        remoteDescriptor('readFile', ['sessionId', 'path'], 'ReadFileResult'),
        remoteDescriptor('writeFile', ['sessionId', 'path', 'text'], 'WriteFileResult'),
        remoteDescriptor('compile', ['sessionId', 'main', 'engine'], 'CompileResult'),
        remoteDescriptor('status', ['sessionId'], 'StatusResult'),
      ],
    };

    // ── styles ─────────────────────────────────────────────────────────────
    const COLORS = {
      border: 'var(--dsw-alias-border-subtle, rgba(127,127,127,0.28))',
      strongBorder: 'var(--dsw-alias-border-strong, rgba(127,127,127,0.45))',
      muted: 'var(--dsw-alias-text-tertiary, rgba(127,127,127,0.95))',
      danger: 'var(--dsw-alias-text-danger, #cf222e)',
      warning: 'var(--dsw-alias-text-warning, #9a6700)',
      accent: 'var(--dsw-alias-text-accent, #0969da)',
      surface: 'var(--dsw-alias-bg-secondary, rgba(127,127,127,0.06))',
    };
    const S = {
      root: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, minWidth: 0, fontSize: 12, color: 'inherit' },
      toolbar: {
        display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
        padding: '7px 9px', borderBottom: `1px solid ${COLORS.border}`, rowGap: 6,
      },
      button: {
        height: 24, padding: '0 9px', borderRadius: 6, border: `1px solid ${COLORS.strongBorder}`,
        background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', lineHeight: '22px',
      },
      primary: {
        height: 24, padding: '0 10px', borderRadius: 6, border: '1px solid transparent',
        background: COLORS.accent, color: '#fff', font: 'inherit', cursor: 'pointer', lineHeight: '22px',
      },
      buttonDisabled: {
        height: 24, padding: '0 9px', borderRadius: 6, border: `1px solid ${COLORS.border}`,
        background: 'transparent', color: COLORS.muted, font: 'inherit', cursor: 'default', lineHeight: '22px',
      },
      select: {
        height: 24, borderRadius: 6, border: `1px solid ${COLORS.border}`, background: 'transparent',
        color: 'inherit', font: 'inherit', maxWidth: 220, padding: '0 4px',
      },
      body: { display: 'flex', flex: 1, minHeight: 0 },
      filePanel: {
        width: 178, minWidth: 120, flexShrink: 0, overflow: 'auto', borderRight: `1px solid ${COLORS.border}`,
        padding: '4px 0',
      },
      fileRow: {
        display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', cursor: 'pointer',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11.5,
      },
      fileRowActive: {
        display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', cursor: 'pointer',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11.5,
        background: COLORS.surface, fontWeight: 600,
      },
      mainTag: {
        marginLeft: 'auto', fontSize: 9.5, padding: '0 4px', borderRadius: 4,
        border: `1px solid ${COLORS.border}`, color: COLORS.muted, flexShrink: 0,
      },
      editorWrap: { position: 'relative', display: 'flex', flex: 1, minWidth: 0, minHeight: 0 },
      gutter: {
        width: 46, flexShrink: 0, overflow: 'hidden', padding: '6px 0', textAlign: 'right',
        color: COLORS.muted, fontFamily: 'var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
        fontSize: 12, lineHeight: '19px', userSelect: 'none', borderRight: `1px solid ${COLORS.border}`,
      },
      gutterLine: { paddingRight: 8, height: 19 },
      textarea: {
        flex: 1, minWidth: 0, minHeight: 0, resize: 'none', border: 'none', outline: 'none',
        background: 'transparent', color: 'inherit', padding: '6px 10px',
        fontFamily: 'var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
        fontSize: 12, lineHeight: '19px', tabSize: 2,
      },
      panel: {
        borderTop: `1px solid ${COLORS.border}`, maxHeight: 190, overflow: 'auto',
        padding: '3px 0',
      },
      diagRow: {
        display: 'flex', gap: 6, padding: '2px 9px', cursor: 'pointer', alignItems: 'baseline',
        fontSize: 11.5, lineHeight: '16px',
      },
      diagWhere: { color: COLORS.muted, flexShrink: 0, fontFamily: 'var(--sw-font-mono, ui-monospace, monospace)' },
      statusBar: {
        display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 9px',
        borderTop: `1px solid ${COLORS.border}`, color: COLORS.muted, fontSize: 11,
      },
      empty: { padding: 16, color: COLORS.muted, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' },
      pre: {
        margin: 0, padding: '6px 10px', fontSize: 11, lineHeight: '15px', overflow: 'auto',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 150,
        fontFamily: 'var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
      },
      dot: { width: 7, height: 7, borderRadius: '50%', display: 'inline-block', flexShrink: 0 },
      chip: { fontSize: 10, padding: '0 5px', borderRadius: 4, border: `1px solid ${COLORS.border}`, color: COLORS.muted },
    };

    // ── helpers ────────────────────────────────────────────────────────────
    function fileAddress(sessionId, relPath) {
      const session = encodeURIComponent(sessionId);
      const path = String(relPath).split('/').map(encodeURIComponent).join('/');
      return `dsh-resource://file/session/${session}/${path}`;
    }

    function readPrefs(key) {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }

    function writePrefs(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* storage is optional */
      }
    }

    function baseName(relPath) {
      const text = String(relPath ?? '');
      const index = text.lastIndexOf('/');
      return index === -1 ? text : text.slice(index + 1);
    }

    function formatSeconds(ms) {
      return `${(Number(ms || 0) / 1000).toFixed(1)}`;
    }

    function localeText(props, key) {
      if (typeof props.t === 'function') {
        try {
          const value = props.t(key);
          if (value && value !== key) return value;
        } catch {
          /* fall through */
        }
      }
      return EN[key] || key;
    }

    // ── editor ─────────────────────────────────────────────────────────────
    function Editor(props) {
      const { value, onChange, onSave, onCompile, gotoLine } = props;
      const textareaRef = useRef(null);
      const gutterRef = useRef(null);
      const lineCount = Math.max(1, value ? value.split('\n').length : 1);
      const numbers = useMemo(() => {
        const list = [];
        for (let index = 1; index <= lineCount; index += 1) list.push(index);
        return list;
      }, [lineCount]);

      useEffect(() => {
        if (!gotoLine || !textareaRef.current) return;
        const textarea = textareaRef.current;
        const lines = value.split('\n');
        const target = Math.max(1, Math.min(Number(gotoLine.line) || 1, lines.length));
        let offset = 0;
        for (let index = 0; index < target - 1; index += 1) offset += lines[index].length + 1;
        textarea.focus();
        textarea.setSelectionRange(offset, offset + (lines[target - 1] || '').length);
        const ratio = (target - 1) / Math.max(1, lines.length - 1);
        textarea.scrollTop = Math.max(0, ratio * textarea.scrollHeight - textarea.clientHeight / 2);
        if (gutterRef.current) gutterRef.current.scrollTop = textarea.scrollTop;
      }, [gotoLine, value]);

      const syncScroll = () => {
        if (gutterRef.current && textareaRef.current) gutterRef.current.scrollTop = textareaRef.current.scrollTop;
      };

      return h('div', { style: S.editorWrap },
        h('div', { ref: gutterRef, style: S.gutter, 'aria-hidden': true },
          numbers.map((number) => h('div', { key: number, style: S.gutterLine }, number))),
        h('textarea', {
          ref: textareaRef,
          value,
          spellCheck: false,
          wrap: 'off',
          'aria-label': 'LaTeX source',
          style: S.textarea,
          onChange: (event) => onChange(event.target.value),
          onScroll: syncScroll,
          onKeyDown: (event) => {
            if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
              event.preventDefault();
              onSave();
              return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              onCompile();
              return;
            }
            if (event.key === 'Tab') {
              event.preventDefault();
              const textarea = event.target;
              const start = textarea.selectionStart;
              const end = textarea.selectionEnd;
              const next = `${value.slice(0, start)}  ${value.slice(end)}`;
              onChange(next);
              window.requestAnimationFrame(() => {
                try {
                  textarea.setSelectionRange(start + 2, start + 2);
                } catch {
                  /* selection may be stale after re-render */
                }
              });
            }
          },
        }),
      );
    }

    // ── studio body ────────────────────────────────────────────────────────
    function Studio(props) {
      const sessionId = props.sessionId
        || (props.tab && props.tab.sessionId)
        || (props.tabInfo && props.tabInfo.tab && props.tabInfo.tab.sessionId)
        || '';
      const actions = props.actions;
      const apiRef = props.api;
      const ready = props.ready;
      const t = (key) => localeText(props, key);
      const prefsKey = sessionId ? `latex-studio:${sessionId}` : 'latex-studio';

      const [phase, setPhase] = useState('init');
      const [discovery, setDiscovery] = useState(null);
      const [selectedProject, setSelectedProject] = useState(0);
      const [mainFile, setMainFile] = useState('');
      const [engine, setEngine] = useState('pdflatex');
      const [openFile, setOpenFile] = useState('');
      const [text, setText] = useState('');
      const [savedText, setSavedText] = useState('');
      const [busy, setBusy] = useState(false);
      const [saving, setSaving] = useState(false);
      const [result, setResult] = useState(null);
      const [error, setError] = useState('');
      const [showLog, setShowLog] = useState(false);
      const [showWarnings, setShowWarnings] = useState(false);
      const [goto, setGoto] = useState(null);

      const call = useCallback(async (method, ...args) => {
        if (!sessionId) throw new Error('this page has no session');
        const service = await ready();
        const response = await service[method](...args);
        if (response && response.ok === true) return response.value;
        const message = response && response.error && response.error.message
          ? response.error.message
          : t('requestFailed');
        throw new Error(message);
      }, [sessionId, ready]);

      const readFile = useCallback(async (relPath) => {
        const value = await call('readFile', sessionId, relPath);
        setOpenFile(relPath);
        setText(value.text);
        setSavedText(value.text);
        return value;
      }, [call, sessionId]);

      const dirty = text !== savedText;

      const project = discovery && discovery.projects[selectedProject] ? discovery.projects[selectedProject] : null;
      const projectFiles = project ? project.files : [];

      const load = useCallback(async (projectIndexOverride) => {
        setPhase('loading');
        setError('');
        try {
          const stored = readPrefs(prefsKey);
          const value = await call('discover', sessionId, stored.projectPath || '');
          setDiscovery(value);
          const index = Math.max(0, Math.min(projectIndexOverride ?? stored.projectIndex ?? 0, value.projects.length - 1));
          const chosen = value.projects[index] || null;
          setSelectedProject(index);
          setEngine(stored.engine && ENGINES.includes(stored.engine) ? stored.engine : 'pdflatex');
          const nextMain = stored.mainFile && value.files.includes(stored.mainFile)
            ? stored.mainFile
            : (chosen && chosen.main) || '';
          setMainFile(nextMain);
          const nextFile = stored.openFile && value.files.includes(stored.openFile)
            ? stored.openFile
            : nextMain || value.files[0] || '';
          if (nextFile) {
            const fileValue = await call('readFile', sessionId, nextFile);
            setOpenFile(nextFile);
            setText(fileValue.text);
            setSavedText(fileValue.text);
          } else {
            setOpenFile('');
            setText('');
            setSavedText('');
          }
          setPhase('ready');
        } catch (loadError) {
          setError(loadError && loadError.message ? loadError.message : String(loadError));
          setPhase('error');
        }
      }, [call, prefsKey, sessionId]);

      useEffect(() => {
        let cancelled = false;
        if (!sessionId) {
          setPhase('error');
          setError('this page has no session');
          return () => {};
        }
        (async () => {
          const stored = readPrefs(prefsKey);
          try {
            setPhase('loading');
            const value = await call('discover', sessionId, stored.projectPath || '');
            if (cancelled) return;
            setDiscovery(value);
            const index = Math.max(0, Math.min(stored.projectIndex || 0, value.projects.length - 1));
            const chosen = value.projects[index] || null;
            setSelectedProject(index);
            setEngine(stored.engine && ENGINES.includes(stored.engine) ? stored.engine : 'pdflatex');
            const nextMain = stored.mainFile && value.files.includes(stored.mainFile)
              ? stored.mainFile
              : (chosen && chosen.main) || '';
            setMainFile(nextMain);
            const nextFile = stored.openFile && value.files.includes(stored.openFile)
              ? stored.openFile
              : nextMain || value.files[0] || '';
            if (nextFile) {
              const fileValue = await call('readFile', sessionId, nextFile);
              if (cancelled) return;
              setOpenFile(nextFile);
              setText(fileValue.text);
              setSavedText(fileValue.text);
            }
            setPhase('ready');
          } catch (loadError) {
            if (!cancelled) {
              setError(loadError && loadError.message ? loadError.message : String(loadError));
              setPhase('error');
            }
          }
        })();
        return () => { cancelled = true; };
      }, [sessionId]);

      useEffect(() => {
        if (!sessionId) return;
        writePrefs(prefsKey, {
          projectIndex: selectedProject,
          mainFile,
          engine,
          openFile,
        });
      }, [prefsKey, sessionId, selectedProject, mainFile, engine, openFile]);

      const openSource = useCallback(async (relPath) => {
        if (!relPath || relPath === openFile) return;
        if (text !== savedText && !window.confirm(t('discardEdits'))) return;
        try {
          await readFile(relPath);
        } catch (openError) {
          setError(openError && openError.message ? openError.message : String(openError));
        }
      }, [openFile, readFile, savedText, t, text]);

      const save = useCallback(async () => {
        if (!openFile || text === savedText) return true;
        setSaving(true);
        try {
          await call('writeFile', sessionId, openFile, text);
          setSavedText(text);
          return true;
        } catch (saveError) {
          setError(saveError && saveError.message ? saveError.message : String(saveError));
          return false;
        } finally {
          setSaving(false);
        }
      }, [call, openFile, sessionId, savedText, text]);

      const openPdf = useCallback((relPath) => {
        if (!relPath) return;
        const address = fileAddress(sessionId, relPath);
        try {
          if (actions && typeof actions.openResource === 'function') {
            actions.openResource(address, { preferNewPane: true });
          } else if (props.openResource && typeof props.openResource === 'function') {
            props.openResource(address, { preferNewPane: true });
          }
        } catch (openError) {
          setError(`${t('openFailed')}: ${openError && openError.message ? openError.message : openError}`);
        }
      }, [actions, sessionId, props.openResource, t]);

      const compile = useCallback(async () => {
        if (busy) return;
        const target = mainFile || openFile;
        if (!target) {
          setError(t('chooseMain'));
          return;
        }
        setBusy(true);
        setError('');
        try {
          if (text !== savedText) {
            const saved = await save();
            if (!saved) return;
          }
          const value = await call('compile', sessionId, target, engine);
          setResult(value);
          if (value && value.pdf) openPdf(value.pdf);
        } catch (buildError) {
          setError(buildError && buildError.message ? buildError.message : String(buildError));
        } finally {
          setBusy(false);
        }
      }, [busy, call, engine, mainFile, openFile, openPdf, save, savedText, sessionId, t, text]);

      const jumpTo = useCallback(async (file, line) => {
        if (!file) return;
        if (file !== openFile) {
          try {
            await readFile(file);
          } catch {
            return;
          }
        }
        if (line) setGoto({ line, at: Date.now() });
      }, [openFile, readFile]);

      const switchProject = useCallback(async (index) => {
        if (!discovery) return;
        if (text !== savedText && !window.confirm(t('discardEdits'))) return;
        const chosen = discovery.projects[index];
        if (!chosen) return;
        setSelectedProject(index);
        const nextMain = chosen.main || '';
        setMainFile(nextMain);
        if (nextMain) {
          try {
            await readFile(nextMain);
          } catch (openError) {
            setError(openError && openError.message ? openError.message : String(openError));
          }
        }
        writePrefs(prefsKey, { projectIndex: index, mainFile: nextMain, engine, openFile: nextMain || openFile });
      }, [discovery, engine, openFile, prefsKey, readFile, savedText, t, text]);

      // ── render ───────────────────────────────────────────────────────────
      if (phase === 'loading' || phase === 'init') {
        return h('div', { style: S.empty }, h('div', null, t('loading')));
      }
      if (phase === 'error') {
        return h('div', { style: S.empty },
          h('div', { style: { color: COLORS.danger, fontWeight: 600 } }, t('buildFailed')),
          h('div', null, error || t('requestFailed')),
          h('button', { type: 'button', style: S.button, onClick: () => { load(0); } }, t('rescan')));
      }

      const files = discovery ? discovery.files : [];
      const errors = result ? result.errors || [] : [];
      const warnings = result ? result.warnings || [] : [];
      const hasProject = Boolean(project && (project.main || project.files.length > 0));

      const toolbar = h('div', { style: S.toolbar },
        discovery && discovery.projects.length > 1 ? h('label', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
          h('span', { style: { color: COLORS.muted } }, t('project')),
          h('select', {
            style: S.select,
            value: selectedProject,
            onChange: (event) => switchProject(Number(event.target.value)),
          }, discovery.projects.map((item, index) => h('option', { key: `${item.root}:${index}`, value: index },
            item.root || t('rootSuffix')))),
        ) : null,
        h('label', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
          h('span', { style: { color: COLORS.muted } }, t('mainFile')),
          h('select', {
            style: S.select,
            value: mainFile,
            onChange: (event) => setMainFile(event.target.value),
          }, [h('option', { key: '', value: '' }, t('pickMain'))].concat(
            projectFiles.filter((file) => /\.tex$/i.test(file)).map((file) => h('option', { key: file, value: file }, file)),
          ))),
        h('label', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
          h('span', { style: { color: COLORS.muted } }, t('engine')),
          h('select', {
            style: S.select,
            value: engine,
            onChange: (event) => setEngine(event.target.value),
          }, ENGINES.map((name) => h('option', { key: name, value: name }, name)))),
        h('button', {
          type: 'button',
          style: busy ? S.buttonDisabled : S.primary,
          onClick: compile,
          disabled: busy,
          title: t('hint'),
        }, busy ? t('compiling') : t('compile')),
        h('button', {
          type: 'button',
          style: dirty && !saving ? S.button : S.buttonDisabled,
          onClick: save,
          disabled: !dirty || saving,
        }, saving ? t('saving') : t('save')),
        result && result.pdf ? h('button', {
          type: 'button',
          style: S.button,
          onClick: () => openPdf(result.pdf),
        }, t('openPdf')) : null,
        h('span', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: COLORS.muted } },
          h('span', { style: { ...S.dot, background: dirty ? COLORS.warning : COLORS.accent } }),
          h('span', null, dirty ? t('dirty') : t('clean'))),
      );

      const filePanel = h('div', { style: S.filePanel },
        files.length === 0
          ? h('div', { style: { padding: '6px 9px', color: COLORS.muted } }, t('noProject'))
          : files.map((file) => h('div', {
            key: file,
            style: file === openFile ? S.fileRowActive : S.fileRow,
            title: file,
            onClick: () => openSource(file),
          },
          h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, baseName(file)),
          file === mainFile ? h('span', { style: S.mainTag }, 'MAIN') : null)),
      );

      const editor = openFile
        ? h(Editor, {
          value: text,
          onChange: setText,
          onSave: save,
          onCompile: compile,
          gotoLine: goto,
        })
        : h('div', { style: S.empty }, h('div', null, t('noFile')));

      const diagnostics = result
        ? h('div', null,
          h('div', { style: S.panel },
            errors.length === 0 && warnings.length === 0
              ? h('div', { style: { padding: '3px 9px', color: COLORS.muted } }, t('noErrors'))
              : null,
            errors.map((entry, index) => h('div', {
              key: `e${index}`,
              style: S.diagRow,
              onClick: () => jumpTo(entry.file, entry.line),
              title: entry.message,
            },
            h('span', { style: { color: COLORS.danger, flexShrink: 0 } }, '✕'),
            h('span', { style: S.diagWhere }, `${entry.file ? baseName(entry.file) : '?'}${entry.line ? `:${entry.line}` : ''}`),
            h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.message))),
            warnings.length > 0 ? h('div', {
              style: { ...S.diagRow, color: COLORS.muted },
              onClick: () => setShowWarnings((open) => !open),
            }, `${showWarnings ? '▾' : '▸'} ${warnings.length} ${t('warnings')}`) : null,
            showWarnings ? warnings.map((entry, index) => h('div', {
              key: `w${index}`,
              style: S.diagRow,
              onClick: () => jumpTo(entry.file, entry.line),
              title: entry.message,
            },
            h('span', { style: { color: COLORS.warning, flexShrink: 0 } }, '!'),
            h('span', { style: S.diagWhere }, `${entry.file ? baseName(entry.file) : '?'}${entry.line ? `:${entry.line}` : ''}`),
            h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.message))) : null,
            result.missingFiles && result.missingFiles.length > 0
              ? h('div', { style: { padding: '2px 9px', color: COLORS.warning } }, `${t('missing')}: ${result.missingFiles.join(', ')}`)
              : null,
          ),
          showLog && result.logTail ? h('pre', { style: S.pre }, result.logTail) : null,
        )
        : null;

      const summary = result
        ? `${result.errors.length} ${t('errors')} · ${result.warnings.length} ${t('warnings')} · ${result.pages ?? '?'} ${t('pages')} · ${result.passes} ${t('passes')} · ${formatSeconds(result.durationMs)}${t('seconds')}`
        : '';

      return h('div', { style: S.root },
        toolbar,
        h('div', { style: S.body }, hasProject ? filePanel : null, editor),
        diagnostics,
        h('div', { style: S.statusBar },
          h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            error ? h('span', { style: { color: COLORS.danger } }, error) : (summary || (project && project.root) || '')),
          h('span', { style: { display: 'flex', gap: 8, flexShrink: 0 } },
            result ? h('span', { style: { cursor: 'pointer' }, onClick: () => setShowLog((open) => !open) },
              showLog ? t('hideLog') : t('log')) : null,
            h('span', { style: { cursor: 'pointer' }, onClick: () => load(selectedProject) }, t('rescan')))),
      );
    }

    // ── registration ───────────────────────────────────────────────────────
    const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'remote'];

    function apply(ctx) {
      const apiRef = { current: null };
      const waiters = [];
      const ready = () => new Promise((resolve) => {
        if (apiRef.current) {
          resolve(apiRef.current);
          return;
        }
        waiters.push(() => resolve(apiRef.current));
      });

      ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'latex-studio: locale');
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: TAB_ID,
        kind: KIND,
        title: () => 'LaTeX Studio',
        guide: [{
          id: 'studio',
          title: 'LaTeX Studio',
          description: 'Edit, compile and preview a LaTeX project',
        }],
      }), 'latex-studio: sidebar tab type');

      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: TAB_ID,
        locale: NS,
        inject: (sessionId, actions) => ({
          sessionId,
          actions,
          api: apiRef,
          ready,
          openResource: (address, options) => ctx.sidebarRight.openResource(address, options),
        }),
      }, Studio)), 'latex-studio: sidebar tab body');

      ctx.remote.$mount(CLIENT_REMOTE).catch((error) => {
        console.error('[latex-studio] typert remote mount failed:', error);
      });
      ctx.inject(['remote.latex'], (scope) => {
        apiRef.current = scope.remote.latex;
        while (waiters.length > 0) waiters.shift()();
      });
    }

    return { inject, apply };
  },
});
