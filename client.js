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
    const ReactDOM = require('react-dom');
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    const zod = require('zod');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback, useMemo } = React;

    const TAB_ID = '@local/latex-studio';
    const KIND = 'latex-studio';
    const OPEN_TAB_ID = '@local/latex-studio.open';
    const OPEN_KIND = 'latex-open';
    const NS = 'latexStudio';
    const REMOTE_PACKAGE = '@local/latex-studio';
    const ENGINES = ['pdflatex', 'xelatex', 'lualatex'];

    // ── copy ────────────────────────────────────────────────────────────────
    const EN = {
      compile: 'Compile',
      compiling: 'Compiling…',
      save: 'Save',
      saving: 'Saving…',
      openPdf: 'Open PDF',
      project: 'Project',
      mainFile: 'Main file',
      engine: 'Engine',
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
      refresh: 'Refresh',
      refreshHint: 'Re-read the project from disk (file list and open file)',
      buildFailed: 'Build failed',
      requestFailed: 'LaTeX request failed',
      noFile: 'Select a file to edit',
      rootSuffix: '(workspace root)',
      missing: 'Missing files',
      openFailed: 'Could not open the PDF preview',
      hint: 'Compile builds the whole project: \\input, bibliography and multi-pass references included.',
      dirty: 'Unsaved',
      clean: 'Up to date',
      openProject: 'Open LaTeX project',
      localMode: 'Local folder',
      remoteMode: 'SSH host',
      hosts: 'Host',
      pathLabel: 'Folder',
      browse: 'Browse…',
      list: 'List',
      open: 'Open project',
      cancel: 'Cancel',
      quoteSelection: 'Quote',
      addAnnotation: 'Annotate',
      basketTitle: 'Annotations',
      submitAll: 'Insert all',
      clearAll: 'Clear',
      commentHint: 'What should change here?',
      switchProject: 'Switch project…',
      projectLocal: 'local',
      projectRemote: 'remote',
      pickHost: 'Pick an SSH host first.',
      pickPath: 'Enter an absolute folder path first.',
      noHosts: 'No SSH hosts configured.',
      emptyDir: 'Empty folder',
      filterFiles: 'Filter files…',
      reused: 'No changes, reused',
      publishFailed: 'Could not publish the preview',
    };
    const ZH = {
      compile: '编译',
      compiling: '编译中…',
      save: '保存',
      saving: '保存中…',
      openPdf: '打开 PDF',
      project: '项目',
      mainFile: '主文件',
      engine: '引擎',
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
      refresh: '刷新',
      refreshHint: '重新从磁盘读取项目（文件列表与当前文件）',
      buildFailed: '编译失败',
      requestFailed: 'LaTeX 请求失败',
      noFile: '选择一个文件开始编辑',
      rootSuffix: '（工作区根目录）',
      missing: '缺失文件',
      openFailed: '无法打开 PDF 预览',
      hint: '编译按整个工程进行：包含 \\input、参考文献与多遍交叉引用。',
      dirty: '未保存',
      clean: '已保存',
      openProject: '打开 LaTeX 项目',
      localMode: '本地文件夹',
      remoteMode: 'SSH 主机',
      hosts: '主机',
      pathLabel: '文件夹',
      browse: '浏览…',
      list: '列出',
      open: '打开项目',
      cancel: '取消',
      quoteSelection: '引用',
      addAnnotation: '加批注',
      basketTitle: '批注篮',
      submitAll: '全部插入对话',
      clearAll: '清空',
      commentHint: '这条要改成什么？',
      switchProject: '切换项目…',
      projectLocal: '本地',
      projectRemote: '远端',
      pickHost: '请先选择 SSH 主机。',
      pickPath: '请先填写绝对路径。',
      noHosts: '还没有配置 SSH 主机。',
      emptyDir: '空文件夹',
      filterFiles: '筛选文件…',
      reused: '无改动，复用',
      publishFailed: '发布预览失败',
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
        remoteDescriptor('discover', ['sessionId', 'projectPath', 'project'], 'DiscoverResult'),
        remoteDescriptor('readFile', ['sessionId', 'path', 'project'], 'ReadFileResult'),
        remoteDescriptor('readBytes', ['sessionId', 'path', 'project'], 'ReadBytesResult'),
        remoteDescriptor('writeFile', ['sessionId', 'path', 'text', 'project'], 'WriteFileResult'),
        remoteDescriptor('compile', ['sessionId', 'main', 'engine', 'project'], 'CompileResult'),
        remoteDescriptor('status', ['sessionId'], 'StatusResult'),
        remoteDescriptor('pickDirectory', [], 'PickDirectoryResult'),
        remoteDescriptor('sshHosts', [], 'SshHostsResult'),
        remoteDescriptor('remoteHome', ['hostId'], 'RemoteHomeResult'),
        remoteDescriptor('remoteList', ['hostId', 'path'], 'RemoteListResult'),
        remoteDescriptor('listDir', ['sessionId', 'path', 'project'], 'ListDirResult'),
        remoteDescriptor('publishFile', ['sessionId', 'path', 'project'], 'PublishFileResult'),
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
      modalBackdrop: {
        position: 'fixed', inset: 0, zIndex: 2147483000, background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      },
      modalCard: {
        width: 'min(760px, 94vw)', maxHeight: '86vh', overflow: 'auto', padding: 20,
        borderRadius: 12, border: `1px solid ${COLORS.border}`, color: 'inherit',
        background: 'var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-primary, #ffffff))',
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', gap: 14,
      },
      modalTitle: { fontSize: 16, fontWeight: 600 },
      modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
      input: {
        height: 24, borderRadius: 6, border: `1px solid ${COLORS.border}`, background: 'transparent',
        color: 'inherit', font: 'inherit', padding: '0 6px', minWidth: 0, flex: 1,
      },
      projectBar: {
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 9px',
        borderBottom: `1px solid ${COLORS.border}`, color: COLORS.muted, fontSize: 11,
      },
      pickerTabs: { display: 'flex', gap: 6 },
      pickerList: { border: `1px solid ${COLORS.border}`, borderRadius: 6, maxHeight: 260, overflow: 'auto' },
      pickerRow: {
        display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px',
        cursor: 'pointer', fontSize: 11.5,
      },
      pickerField: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      pickerLabel: { color: COLORS.muted, minWidth: 58, flexShrink: 0 },
      pickerError: { color: COLORS.danger, fontSize: 11.5, lineHeight: '16px' },
      tab: {
        height: 26, padding: '0 12px', borderRadius: 6, border: `1px solid ${COLORS.border}`,
        background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit',
      },
      tabActive: {
        height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid transparent',
        background: COLORS.accent, color: '#fff', cursor: 'pointer', font: 'inherit',
      },
      treeRoot: { display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 },
      treeFilter: {
        margin: '4px 6px', height: 22, fontSize: 11, border: `1px solid ${COLORS.border}`,
        borderRadius: 5, background: 'transparent', color: 'inherit', padding: '0 6px', minWidth: 0,
      },
      treeBody: { flex: 1, minHeight: 0, overflow: 'auto', paddingBottom: 8 },
      treeRow: {
        display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px',
        cursor: 'pointer', fontSize: 11.5, whiteSpace: 'nowrap',
      },
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

    // ── opened project (per session, survives reloads) ─────────────────────
    // A project is a plain descriptor the Host can route: {kind:'local', root}
    // or {kind:'remote', hostId, root}. It lives in localStorage so the Client
    // keeps no Host-side project state.
    const projectListeners = new Set();

    function projectStorageKey(sessionId) {
      return `latex-studio-project:${sessionId}`;
    }

    function readProject(sessionId) {
      if (!sessionId) return null;
      try {
        const raw = window.localStorage.getItem(projectStorageKey(sessionId));
        if (!raw) return null;
        const value = JSON.parse(raw);
        if (!value || typeof value !== 'object') return null;
        if (typeof value.root !== 'string' || value.root.length === 0) return null;
        if (value.kind !== 'remote' && value.kind !== 'local') return null;
        if (value.kind === 'remote' && typeof value.hostId !== 'string') return null;
        return value;
      } catch {
        return null;
      }
    }

    function writeProject(sessionId, project) {
      if (!sessionId) return;
      try {
        if (project) window.localStorage.setItem(projectStorageKey(sessionId), JSON.stringify(project));
        else window.localStorage.removeItem(projectStorageKey(sessionId));
      } catch {
        /* private mode: the picker still opens the project for this page life */
      }
      for (const listener of [...projectListeners]) {
        try {
          listener();
        } catch {
          /* ignore */
        }
      }
    }

    function subscribeProject(listener) {
      projectListeners.add(listener);
      return () => projectListeners.delete(listener);
    }

    function isAbsoluteFolder(path) {
      const text = String(path || '').trim();
      return text.startsWith('/') || /^[A-Za-z]:[\\/]/.test(text);
    }

    function projectLabel(project) {
      if (!project || !project.root) return '';
      return project.label || baseName(project.root) || project.root;
    }

    // ── per-project cache (tab remounts must not refetch the cloud) ────────
    // The right sidebar unmounts an inactive tab, so every switch would replay
    // discover/readFile otherwise. Entries live for the page life only.
    const projectCaches = new Map();

    function projectCacheKey(sessionId, project) {
      if (!project) return `${sessionId}::workspace`;
      return `${sessionId}::${project.kind}:${project.hostId || ''}:${project.root}`;
    }

    function readLastProject() {
      try {
        const raw = window.localStorage.getItem('latex-studio:last-project');
        if (!raw) return null;
        const value = JSON.parse(raw);
        if (!value || typeof value !== 'object' || typeof value.root !== 'string') return null;
        return value;
      } catch {
        return null;
      }
    }

    function writeLastProject(project) {
      try {
        window.localStorage.setItem('latex-studio:last-project', JSON.stringify(project));
      } catch {
        /* private mode */
      }
    }

    function discoveryStorageKey(key) {
      return `latex-studio-discovery:${key}`;
    }

    function readStoredDiscovery(key) {
      try {
        const raw = window.localStorage.getItem(discoveryStorageKey(key));
        if (!raw) return null;
        const value = JSON.parse(raw);
        return value && typeof value === 'object' && Array.isArray(value.files) ? value : null;
      } catch {
        return null;
      }
    }

    function writeStoredDiscovery(key, value) {
      try {
        const payload = JSON.stringify(value);
        if (payload.length > 512000) return;
        window.localStorage.setItem(discoveryStorageKey(key), payload);
      } catch {
        /* quota or private mode */
      }
    }

    function cacheFor(sessionId, project) {
      const key = projectCacheKey(sessionId, project);
      let entry = projectCaches.get(key);
      if (!entry) {
        entry = { discovery: readStoredDiscovery(key), texts: new Map(), dirs: new Map(), at: 0 };
        projectCaches.set(key, entry);
      }
      return entry;
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


    // ── project tree (Codex-style, lazily expanded) ────────────────────────
    const TREE_SKIP = new Set(['node_modules', '.git', 'build', 'dist', 'out', '.venv', 'venv', '__pycache__', '.cache', '.dsmlp', 'tmp', '.ipynb_checkpoints']);

    function fileGlyph(name) {
      const lower = String(name).toLowerCase();
      if (lower.endsWith('.tex')) return 'T';
      if (lower.endsWith('.bib')) return 'B';
      if (lower.endsWith('.sty') || lower.endsWith('.cls') || lower.endsWith('.bst')) return 'S';
      if (lower.endsWith('.pdf')) return 'P';
      if (/\.(png|jpe?g|svg|eps|gif)$/.test(lower)) return 'I';
      return '·';
    }

    function sortEntries(list) {
      return [...list].sort((a, b) => (a.type === b.type
        ? a.name.localeCompare(b.name)
        : a.type === 'directory' ? -1 : 1));
    }

    function ProjectTree(props) {
      const { sessionId, call, project, currentFile, mainFile, onOpen, t, cache } = props;
      const [entries, setEntries] = useState(null);
      const [error, setError] = useState('');
      const [filter, setFilter] = useState('');

      useEffect(() => {
        let cancelled = false;
        setEntries(null);
        setError('');
        const cached = cache && cache.dirs.get('');
        if (cached) {
          setEntries(cached);
          return () => { cancelled = true; };
        }
        (async () => {
          try {
            const value = await call('listDir', sessionId, '', project);
            const entriesValue = Array.isArray(value && value.entries) ? value.entries : [];
            if (cache) cache.dirs.set('', entriesValue);
            if (!cancelled) setEntries(entriesValue);
          } catch (loadError) {
            if (!cancelled) setError(loadError && loadError.message ? loadError.message : String(loadError));
          }
        })();
        return () => { cancelled = true; };
      }, [sessionId, project, call, cache]);

      const visible = useMemo(() => {
        const q = filter.trim().toLowerCase();
        const list = (Array.isArray(entries) ? entries : []).filter((entry) => !TREE_SKIP.has(entry.name));
        return sortEntries(q ? list.filter((entry) => entry.name.toLowerCase().includes(q)) : list);
      }, [entries, filter]);

      return h('div', { style: S.treeRoot },
        h('input', {
          style: S.treeFilter,
          placeholder: t('filterFiles'),
          value: filter,
          onChange: (event) => setFilter(event.target.value),
        }),
        error ? h('div', { style: { padding: '4px 8px', color: COLORS.danger, fontSize: 11 } }, error) : null,
        entries === null && !error
          ? h('div', { style: { padding: '4px 9px', color: COLORS.muted } }, t('loading'))
          : null,
        h('div', { style: S.treeBody },
          visible.map((entry) => h(TreeNode, {
            key: entry.name,
            entry,
            path: entry.name,
            depth: 0,
            sessionId,
            call,
            project,
            currentFile,
            mainFile,
            onOpen,
            cache,
          }))));
    }

    function TreeNode(props) {
      const { entry, path, depth, sessionId, call, project, currentFile, mainFile, onOpen, cache } = props;
      const [open, setOpen] = useState(false);
      const [children, setChildren] = useState(null);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState('');
      const isDir = entry.type === 'directory';

      const toggle = useCallback(async () => {
        if (!isDir) {
          if (typeof onOpen === 'function') onOpen(path);
          return;
        }
        const next = !open;
        setOpen(next);
        if (!next || children !== null) return;
        setLoading(true);
        setError('');
        try {
          const cached = cache && cache.dirs.get(path);
          if (cached) {
            setChildren(cached);
            return;
          }
          const value = await call('listDir', sessionId, path, project);
          const entriesValue = Array.isArray(value && value.entries) ? value.entries : [];
          if (cache) cache.dirs.set(path, entriesValue);
          setChildren(entriesValue);
        } catch (loadError) {
          setError(loadError && loadError.message ? loadError.message : String(loadError));
        } finally {
          setLoading(false);
        }
      }, [isDir, open, children, path, call, sessionId, project, onOpen, cache]);

      const childList = children === null
        ? []
        : sortEntries(children.filter((child) => !TREE_SKIP.has(child.name)));
      const active = currentFile === path;

      return h('div', null,
        h('div', {
          style: {
            ...S.treeRow,
            paddingLeft: 6 + depth * 12,
            background: active ? COLORS.surface : 'transparent',
            fontWeight: active ? 600 : 400,
            color: isDir ? 'inherit' : COLORS.muted,
          },
          onClick: toggle,
          title: path,
        },
        h('span', { style: { width: 10, flexShrink: 0, color: COLORS.muted } }, isDir ? (open ? '▾' : '▸') : ''),
        h('span', {
          style: { width: 14, flexShrink: 0, fontFamily: 'monospace', fontSize: 10, color: isDir ? COLORS.muted : COLORS.accent },
        }, isDir ? '' : fileGlyph(entry.name)),
        h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.name),
        path === mainFile ? h('span', { style: S.mainTag }, 'MAIN') : null),
        isDir && open
          ? h('div', null,
            loading ? h('div', { style: { ...S.treeRow, paddingLeft: 18 + depth * 12, color: COLORS.muted } }, '…') : null,
            error ? h('div', { style: { ...S.treeRow, paddingLeft: 18 + depth * 12, color: COLORS.danger } }, error) : null,
            childList.map((child) => h(TreeNode, {
              key: child.name,
              entry: child,
              path: `${path}/${child.name}`,
              depth: depth + 1,
              sessionId,
              call,
              project,
              currentFile,
              mainFile,
              onOpen,
              cache,
            })))
          : null);
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
      const [openedProject, setOpenedProject] = useState(() => readProject(sessionId));
      const [previewPath, setPreviewPath] = useState('');
      const [showTree, setShowTree] = useState(true);
      const openPicker = props.openPicker;

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
      const [refreshing, setRefreshing] = useState(false);

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

      const cache = cacheFor(sessionId, openedProject);

      const readFile = useCallback(async (relPath) => {
        let nextText = cache.texts.get(relPath);
        if (nextText === undefined) {
          nextText = (await call('readFile', sessionId, relPath, openedProject)).text;
          cache.texts.set(relPath, nextText);
        }
        setOpenFile(relPath);
        setText(nextText);
        setSavedText(nextText);
        return { path: relPath, text: nextText };
      }, [cache, call, sessionId, openedProject]);

      const dirty = text !== savedText;

      const project = discovery && discovery.projects[selectedProject] ? discovery.projects[selectedProject] : null;
      const projectFiles = project ? project.files : [];

      const applyDiscovery = useCallback(async (value, stored, preferIndex) => {
        setDiscovery(value);
        const index = Math.max(0, Math.min(preferIndex ?? stored.projectIndex ?? 0, value.projects.length - 1));
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
          let nextText = cache.texts.get(nextFile);
          if (nextText === undefined) {
            nextText = (await call('readFile', sessionId, nextFile, openedProject)).text;
            cache.texts.set(nextFile, nextText);
          }
          setOpenFile(nextFile);
          setText(nextText);
          setSavedText(nextText);
        } else {
          setOpenFile('');
          setText('');
          setSavedText('');
        }
      }, [cache, call, openedProject, sessionId]);

      const load = useCallback(async (projectIndexOverride, force) => {
        setPhase('loading');
        setError('');
        try {
          const stored = readPrefs(prefsKey);
          if (!force && cache.discovery) {
            await applyDiscovery(cache.discovery, stored, projectIndexOverride);
            setPhase('ready');
            call('discover', sessionId, openedProject ? '' : (stored.projectPath || ''), openedProject)
              .then((value) => {
                cache.discovery = value;
                cache.at = Date.now();
                cache.dirs.clear();
                writeStoredDiscovery(projectCacheKey(sessionId, openedProject), value);
              })
              .catch(() => { /* keep the cached view */ });
            return;
          }
          const value = await call('discover', sessionId, openedProject ? '' : (stored.projectPath || ''), openedProject);
          cache.discovery = value;
          cache.at = Date.now();
          cache.dirs.clear();
          writeStoredDiscovery(projectCacheKey(sessionId, openedProject), value);
          await applyDiscovery(value, stored, projectIndexOverride);
          setPhase('ready');
        } catch (loadError) {
          setError(loadError && loadError.message ? loadError.message : String(loadError));
          setPhase('error');
        }
      }, [applyDiscovery, cache, call, openedProject, prefsKey, sessionId]);

      // The repository changes outside DSH all the time: re-read the file list,
      // the main-file candidates and the open file without a page reload.
      const refresh = useCallback(async () => {
        if (dirty && !window.confirm(t('discardEdits'))) return;
        setRefreshing(true);
        setError('');
        try {
          cache.texts.clear();
          await load(selectedProject, true);
        } catch (refreshError) {
          setError(refreshError && refreshError.message ? refreshError.message : String(refreshError));
        } finally {
          setRefreshing(false);
        }
      }, [cache, dirty, load, selectedProject, t]);

      useEffect(() => subscribeProject(() => {
        setOpenedProject(readProject(sessionId));
      }), [sessionId]);

      useEffect(() => {
        // The button belongs to a build made in this page life: never restore it
        // from an earlier session's preview.
        setPreviewPath('');
        setResult(null);
        setError('');
      }, [sessionId, openedProject]);

      useEffect(() => {
        if (!sessionId) {
          setPhase('error');
          setError('this page has no session');
          return;
        }
        load(0, false);
      }, [load, sessionId]);

      useEffect(() => subscribeProject(() => {
        setOpenedProject(readProject(sessionId));
      }), [sessionId]);

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
            const value = await call('discover', sessionId, openedProject ? '' : (stored.projectPath || ''), openedProject);
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
              const fileValue = await call('readFile', sessionId, nextFile, openedProject);
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
      }, [call, openedProject, prefsKey, sessionId]);

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
          await call('writeFile', sessionId, openFile, text, openedProject);
          cache.texts.set(openFile, text);
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
            actions.openResource(address, {});
          } else if (props.openResource && typeof props.openResource === 'function') {
            props.openResource(address, {});
          }
        } catch (openError) {
          setError(`${t('openFailed')}: ${openError && openError.message ? openError.message : openError}`);
        }
      }, [actions, sessionId, props.openResource, t]);

      const PREVIEW_FILE_RE = /\.(?:pdf|png|jpe?g|gif|webp|svg|html?)$/i;
      const openAnyFile = useCallback(async (relPath) => {
        if (!relPath) return;
        if (!PREVIEW_FILE_RE.test(relPath)) {
          await openSource(relPath);
          return;
        }
        try {
          let target = relPath;
          if (openedProject) {
            const published = await call('publishFile', sessionId, relPath, openedProject);
            if (published && published.path) target = published.path;
          }
          openPdf(target);
        } catch (previewError) {
          setError(previewError && previewError.message ? previewError.message : String(previewError));
        }
      }, [call, openPdf, openedProject, openSource, sessionId]);

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
          const value = await call('compile', sessionId, target, engine, openedProject);
          setResult(value);
          if (value && value.ok && value.pdf) {
            let preview = '';
            if (openedProject) {
              try {
                const published = await call('publishFile', sessionId, value.pdf, openedProject);
                if (published && published.path) preview = published.path;
              } catch (publishError) {
                setError(`${t('publishFailed')}: ${publishError && publishError.message ? publishError.message : publishError}`);
              }
            } else {
              preview = value.pdf;
            }
            if (!preview) {
              setBusy(false);
              return;
            }
            setPreviewPath(preview);
            openPdf(preview);
          }
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
          h('div', { style: { display: 'flex', gap: 6 } },
            h('button', { type: 'button', style: S.button, onClick: refresh }, t('refresh')),
            h('button', { type: 'button', style: S.button, onClick: () => { if (typeof openPicker === 'function') openPicker(); } }, t('openProject'))));
      }

      const files = discovery ? discovery.files : [];
      const errors = result ? result.errors || [] : [];
      const warnings = result ? result.warnings || [] : [];
      const hasProject = Boolean(project && (project.main || project.files.length > 0));

      const projectBar = h('div', { style: S.projectBar },
        h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          openedProject
            ? `${openedProject.kind === 'remote' ? t('projectRemote') : t('projectLocal')} · ${projectLabel(openedProject)}`
            : t('noProject')),
        h('button', {
          type: 'button', style: S.button, title: showTree ? '隐藏文件树' : '显示文件树',
          onClick: () => setShowTree((value) => !value),
        }, showTree ? '◧' : '▢'),
        h('span', { style: { marginLeft: 'auto', display: 'flex', gap: 6 } },
          h('button', {
            type: 'button',
            style: refreshing ? S.buttonDisabled : S.button,
            disabled: refreshing,
            title: t('refreshHint'),
            onClick: refresh,
          }, refreshing ? '↻ …' : `↻ ${t('refresh')}`),
          h('button', { type: 'button', style: S.button, onClick: () => { if (typeof openPicker === 'function') openPicker(); } }, openedProject ? t('switchProject') : t('openProject'))),
      );

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
        (previewPath || (result && result.pdf)) ? h('button', {
          type: 'button',
          style: S.button,
          onClick: () => openPdf(previewPath || result.pdf),
        }, t('openPdf')) : null,
        h('span', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: COLORS.muted } },
          h('span', { style: { ...S.dot, background: dirty ? COLORS.warning : COLORS.accent } }),
          h('span', null, dirty ? t('dirty') : t('clean'))),
      );

      const filePanel = showTree ? h('div', { style: S.filePanel },
        files.length === 0 && !openedProject
          ? h('div', { style: { padding: '6px 9px', color: COLORS.muted, display: 'flex', flexDirection: 'column', gap: 6 } },
            h('div', null, t('noProject')),
            h('button', { type: 'button', style: S.button, onClick: () => { if (typeof openPicker === 'function') openPicker(); } }, t('openProject')))
          : h(ProjectTree, {
            sessionId,
            call,
            project: openedProject,
            currentFile: openFile,
            mainFile,
            onOpen: openAnyFile,
            t,
            cache,
          }),
      ) : null;

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
        ? `${result.skipped ? `${t('reused')} · ` : ''}${result.errors.length} ${t('errors')} · ${result.warnings.length} ${t('warnings')} · ${result.pages ?? '?'} ${t('pages')} · ${result.passes} ${t('passes')} · ${formatSeconds(result.durationMs)}${t('seconds')}`
        : '';

      return h('div', { style: S.root },
        projectBar,
        toolbar,
        h('div', { style: S.body }, hasProject ? filePanel : null, editor),
        diagnostics,
        h('div', { style: S.statusBar },
          h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            error ? h('span', { style: { color: COLORS.danger } }, error) : (summary || (project && project.root) || '')),
          h('span', { style: { display: 'flex', gap: 8, flexShrink: 0 } },
            result ? h('span', { style: { cursor: 'pointer' }, onClick: () => setShowLog((open) => !open) },
              showLog ? t('hideLog') : t('log')) : null,
            h('span', { style: { cursor: 'pointer' }, onClick: refresh }, `↻ ${t('refresh')}`))),
      );
    }


    // ── "open project" modal (local folder / SSH host folder) ──────────────
    let dialogUnmount = null;

    function closeProjectDialog() {
      if (dialogUnmount) {
        const unmount = dialogUnmount;
        dialogUnmount = null;
        try { unmount(); } catch { /* ignore */ }
      }
    }

    function showProjectDialog(params) {
      if (typeof document === 'undefined' || !ReactDOM) return;
      closeProjectDialog();
      const host = document.createElement('div');
      host.setAttribute('data-latex-studio-dialog', '1');
      document.body.appendChild(host);
      let root = null;
      let closed = false;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        try {
          if (root && typeof root.unmount === 'function') root.unmount();
          else if (typeof ReactDOM.unmountComponentAtNode === 'function') ReactDOM.unmountComponentAtNode(host);
        } catch { /* ignore */ }
        host.remove();
        if (dialogUnmount === cleanup) dialogUnmount = null;
      };
      dialogUnmount = cleanup;
      const element = h(ProjectDialog, { ...params, onClose: cleanup });
      if (typeof ReactDOM.createRoot === 'function') {
        root = ReactDOM.createRoot(host);
        root.render(element);
      } else {
        ReactDOM.render(element, host);
      }
    }

    function ProjectDialog(props) {
      const sessionId = props.sessionId || '';
      const call = props.call;
      const onClose = props.onClose;
      const onOpened = props.onOpened;
      const t = (key) => localeText(props, key);
      const saved = (sessionId ? readProject(sessionId) : null) || readLastProject();

      const [mode, setMode] = useState(saved && saved.kind === 'remote' ? 'remote' : 'local');
      const [localPath, setLocalPath] = useState(saved && saved.kind === 'local' ? saved.root : '');
      const [hosts, setHosts] = useState([]);
      const [hostId, setHostId] = useState(saved && saved.kind === 'remote' ? saved.hostId : '');
      const [remotePath, setRemotePath] = useState(saved && saved.kind === 'remote' ? saved.root : '');
      const [entries, setEntries] = useState([]);
      const [listed, setListed] = useState(false);
      const [parent, setParent] = useState('');
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');

      useEffect(() => {
        let cancelled = false;
        (async () => {
          try {
            const value = await call('sshHosts');
            if (!cancelled) setHosts(Array.isArray(value && value.hosts) ? value.hosts : []);
          } catch {
            /* no toolkit: local folders still work */
          }
        })();
        return () => { cancelled = true; };
      }, [call]);

      const listRemote = useCallback(async (target) => {
        if (!hostId) return;
        setBusy(true);
        setError('');
        try {
          const value = await call('remoteList', hostId, target);
          setEntries(Array.isArray(value && value.entries) ? value.entries : []);
          setRemotePath(String((value && value.path) || target));
          setParent(String((value && value.parent) || ''));
          setListed(true);
        } catch (listError) {
          setError(listError && listError.message ? listError.message : String(listError));
        } finally {
          setBusy(false);
        }
      }, [call, hostId]);

      useEffect(() => {
        if (mode !== 'remote' || !hostId || remotePath) return undefined;
        let cancelled = false;
        (async () => {
          try {
            const value = await call('remoteHome', hostId);
            if (!cancelled && value && typeof value.home === 'string' && value.home) await listRemote(value.home);
          } catch (homeError) {
            if (!cancelled) setError(homeError && homeError.message ? homeError.message : String(homeError));
          }
        })();
        return () => { cancelled = true; };
      }, [mode, hostId, remotePath, call, listRemote]);

      useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [onClose]);

      const browseLocal = useCallback(async () => {
        setBusy(true);
        setError('');
        try {
          const value = await call('pickDirectory');
          if (value && typeof value.path === 'string' && value.path) setLocalPath(value.path);
        } catch (browseError) {
          setError(browseError && browseError.message ? browseError.message : String(browseError));
        } finally {
          setBusy(false);
        }
      }, [call]);

      const openProject = useCallback(() => {
        if (mode === 'remote' && !hostId) {
          setError(t('pickHost'));
          return;
        }
        const root = (mode === 'local' ? localPath : remotePath).trim();
        if (!root || !isAbsoluteFolder(root)) {
          setError(t('pickPath'));
          return;
        }
        const project = mode === 'local'
          ? { kind: 'local', root, label: baseName(root) }
          : { kind: 'remote', hostId, root, label: baseName(root) };
        writeProject(sessionId, project);
        writeLastProject(project);
        onClose();
        if (typeof onOpened === 'function') onOpened(project);
      }, [mode, localPath, remotePath, hostId, sessionId, onClose, onOpened, t]);

      const rows = [];
      if (mode === 'remote' && listed) {
        if (parent) {
          rows.push(h('div', { key: '..', style: S.pickerRow, onClick: () => listRemote(parent) },
            h('span', { style: { color: COLORS.muted } }, '..')));
        }
        for (const entry of entries) {
          const isDir = entry.type === 'directory';
          rows.push(h('div', {
            key: entry.name,
            style: { ...S.pickerRow, color: isDir ? 'inherit' : COLORS.muted, cursor: isDir ? 'pointer' : 'default' },
            onClick: isDir ? () => listRemote(`${remotePath.replace(/\/$/, '')}/${entry.name}`) : undefined,
          }, h('span', { style: { width: 14, color: COLORS.muted } }, isDir ? '▸' : ''),
          h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.name)));
        }
        if (rows.length === 0) rows.push(h('div', { key: 'empty', style: S.pickerRow }, t('emptyDir')));
      }

      return h('div', {
        style: S.modalBackdrop,
        onMouseDown: (event) => { if (event.target === event.currentTarget) onClose(); },
      },
      h('div', { style: S.modalCard },
        h('div', { style: S.modalTitle }, t('openProject')),
        h('div', { style: S.pickerTabs },
          h('button', {
            type: 'button', style: mode === 'local' ? S.tabActive : S.tab,
            onClick: () => { setMode('local'); setError(''); },
          }, t('localMode')),
          h('button', {
            type: 'button', style: mode === 'remote' ? S.tabActive : S.tab,
            onClick: () => { setMode('remote'); setError(''); },
          }, t('remoteMode'))),
        mode === 'local'
          ? h('div', { style: S.pickerField },
            h('span', { style: S.pickerLabel }, t('pathLabel')),
            h('input', {
              style: S.input, value: localPath, placeholder: '',
              onChange: (event) => setLocalPath(event.target.value),
            }),
            h('button', { type: 'button', style: S.button, disabled: busy, onClick: browseLocal }, t('browse')))
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            h('div', { style: S.pickerField },
              h('span', { style: S.pickerLabel }, t('hosts')),
              h('select', {
                style: { ...S.select, maxWidth: 'none', flex: 1 },
                value: hostId,
                onChange: (event) => { setHostId(event.target.value); setRemotePath(''); setEntries([]); setListed(false); },
              }, [h('option', { key: '', value: '' }, '-')].concat(
                hosts.map((host) => h('option', { key: host.id, value: host.id }, `${host.name} (${host.host})`)),
              ))),
            h('div', { style: S.pickerField },
              h('span', { style: S.pickerLabel }, t('pathLabel')),
              h('input', {
                style: S.input, value: remotePath,
                onChange: (event) => setRemotePath(event.target.value),
              }),
              h('button', { type: 'button', style: S.button, disabled: busy || !hostId, onClick: () => listRemote(remotePath || '/') }, t('list'))),
            hosts.length === 0 ? h('div', { style: S.pickerError }, t('noHosts')) : null),
        mode === 'remote' && listed ? h('div', { style: S.pickerList }, rows) : null,
        error ? h('div', { style: S.pickerError }, error) : null,
        h('div', { style: S.modalFooter },
          h('button', { type: 'button', style: S.button, onClick: onClose }, t('cancel')),
          h('button', { type: 'button', style: busy ? S.buttonDisabled : S.primary, disabled: busy, onClick: openProject }, t('open')))));
    }

    // ── annotation tools over the native PDF preview ───────────────────────
    // DSH's document preview renders PDFs with pdf.js text layers, so a real
    // selection exists in this document. Annotations are collected here and
    // inserted into the composer as quote nodes — one per annotation — which
    // gives the Codex-style "comment several passages, submit once" flow.
    function installAnnotationTools(scope, t) {
      if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};
      const uiSession = scope && scope.uiSession;
      const make = (tag, css, text) => {
        const node = document.createElement(tag);
        if (css) Object.assign(node.style, css);
        if (text !== undefined) node.textContent = text;
        return node;
      };
      const pill = (label) => make('button', {
        padding: '4px 9px', borderRadius: '999px', border: '1px solid #d0d7de',
        background: '#ffffff', color: '#1f2328', cursor: 'pointer', font: 'inherit',
      }, label);

      const bar = make('div', {
        position: 'fixed', zIndex: '2147483000', display: 'none', gap: '6px',
        padding: '4px', borderRadius: '10px', border: '1px solid #d0d7de',
        background: '#ffffff', color: '#1f2328', boxShadow: '0 6px 20px rgba(31,35,40,0.16)',
        font: '12px/1.2 system-ui, -apple-system, sans-serif',
      });
      const quoteButton = pill(t('quoteSelection'));
      const annotateButton = pill(t('addAnnotation'));
      quoteButton.type = 'button';
      annotateButton.type = 'button';
      bar.append(quoteButton, annotateButton);
      document.body.appendChild(bar);

      const panel = make('div', {
        position: 'fixed', right: '16px', bottom: '16px', width: '360px', maxHeight: '48vh',
        display: 'none', flexDirection: 'column', gap: '8px', padding: '12px', zIndex: '2147483000',
        borderRadius: '12px', border: '1px solid #d0d7de',
        background: '#ffffff', color: '#1f2328',
        boxShadow: '0 12px 32px rgba(31,35,40,0.18)', font: '12px/1.45 system-ui, sans-serif',
      });
      const header = make('div', { display: 'flex', alignItems: 'center', gap: '6px' });
      const title = make('span', { fontWeight: '600', color: '#1f2328' }, t('basketTitle'));
      const closeButton = pill('×');
      closeButton.type = 'button';
      closeButton.style.marginLeft = 'auto';
      header.append(title, closeButton);
      const list = make('div', { display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'auto' });
      const footer = make('div', { display: 'flex', gap: '6px', justifyContent: 'flex-end' });
      const clearButton = pill(t('clearAll'));
      const submitButton = pill(t('submitAll'));
      clearButton.type = 'button';
      submitButton.type = 'button';
      submitButton.style.background = '#1f6feb';
      submitButton.style.borderColor = '#1f6feb';
      submitButton.style.color = '#ffffff';
      footer.append(clearButton, submitButton);
      panel.append(header, list, footer);
      document.body.appendChild(panel);

      let annotations = [];
      let nextId = 1;
      let current = null;
      let timer = null;

      const bindingNow = () => {
        try {
          const store = uiSession && uiSession.current;
          return store && typeof store.getSnapshot === 'function' ? store.getSnapshot() : null;
        } catch {
          return null;
        }
      };
      const inputActions = () => {
        try {
          const binding = bindingNow();
          const actions = binding && binding.props ? binding.props.inputActions : null;
          return actions && typeof actions.insertQuote === 'function' ? actions : null;
        } catch {
          return null;
        }
      };
      const insertQuote = (text) => {
        const actions = inputActions();
        if (!actions) return false;
        try {
          return actions.insertQuote(text) === true;
        } catch {
          return false;
        }
      };
      const copyFallback = (text) => {
        try {
          navigator.clipboard.writeText(text);
        } catch {
          /* ignore */
        }
      };

      const hideBar = () => { bar.style.display = 'none'; };
      const clearAnnotations = () => {
        if (annotations.length === 0) return;
        annotations = [];
        nextId = 1;
        renderPanel();
      };
      const pageOf = (element) => {
        try {
          const layer = element && element.closest ? element.closest('.textLayer') : null;
          if (!layer) return 0;
          const layers = Array.from(document.querySelectorAll('.textLayer'));
          const index = layers.indexOf(layer);
          return index >= 0 ? index + 1 : 0;
        } catch {
          return 0;
        }
      };

      function renderPanel() {
        list.textContent = '';
        title.textContent = `${t('basketTitle')} (${annotations.length})`;
        if (annotations.length === 0) {
          panel.style.display = 'none';
          return;
        }
        panel.style.display = 'flex';
        for (const annotation of annotations) {
          const row = make('div', {
            display: 'flex', flexDirection: 'column', gap: '4px',
            padding: '8px', borderRadius: '8px', border: '1px solid #e1e6eb',
            background: '#f6f8fa', color: '#1f2328',
          });
          const head = make('div', { display: 'flex', alignItems: 'center', gap: '6px', color: '#57606a' });
          head.append(make('span', { fontWeight: '600' },
            `#${annotation.id}${annotation.page ? ` · p.${annotation.page}` : ''}`));
          const remove = pill('×');
          remove.type = 'button';
          remove.style.marginLeft = 'auto';
          remove.style.padding = '0 7px';
          remove.addEventListener('click', () => {
            annotations = annotations.filter((item) => item.id !== annotation.id);
            renderPanel();
          });
          head.append(remove);
          const preview = make('div', {
            color: '#57606a', overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', fontSize: '11px',
          }, annotation.text.slice(0, 90));
          preview.title = annotation.text;
          const comment = make('textarea', {
            width: '100%', minHeight: '38px', resize: 'vertical', borderRadius: '6px',
            border: '1px solid #d0d7de', background: '#ffffff', color: '#1f2328',
            font: 'inherit', padding: '5px 7px', boxSizing: 'border-box',
          });
          comment.placeholder = t('commentHint');
          comment.value = annotation.comment;
          comment.addEventListener('input', (event) => { annotation.comment = event.target.value; });
          row.append(head, preview, comment);
          list.append(row);
        }
      }

      const submit = () => {
        if (annotations.length === 0) return;
        const blocks = annotations.map((annotation) => {
          const head = `[批注 #${annotation.id}${annotation.page ? ` · p.${annotation.page}` : ''}]`;
          const body = `${head} ${annotation.text}`;
          return annotation.comment.trim() ? `${body}\n要求：${annotation.comment.trim()}` : body;
        });
        let inserted = 0;
        for (const block of blocks) if (insertQuote(block)) inserted += 1;
        if (inserted === 0) copyFallback(blocks.join('\n\n'));
        annotations = [];
        renderPanel();
      };

      const addAnnotation = () => {
        if (!current) return;
        annotations.push({ id: nextId, text: current.text, page: current.page, comment: '' });
        nextId += 1;
        renderPanel();
        hideBar();
      };

      const quoteNow = () => {
        if (!current) return;
        if (!insertQuote(current.text)) copyFallback(current.text);
        hideBar();
      };

      const place = () => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
          hideBar();
          current = null;
          return;
        }
        const text = String(selection.toString() || '').trim();
        if (!text) {
          hideBar();
          current = null;
          return;
        }
        const node = selection.anchorNode;
        const element = node && node.nodeType === 3 ? node.parentElement : node;
        if (!element || typeof element.closest !== 'function' || !element.closest('.textLayer')) {
          hideBar();
          current = null;
          return;
        }
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          hideBar();
          current = null;
          return;
        }
        current = { text, page: pageOf(element) };
        bar.style.display = 'flex';
        bar.style.left = `${Math.min(Math.max(8, rect.left), window.innerWidth - 190)}px`;
        bar.style.top = `${Math.min(Math.max(8, rect.bottom + 8), window.innerHeight - 46)}px`;
      };

      const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(place, 120);
      };
      const onBarDown = (event) => { event.preventDefault(); };
      const onQuote = (event) => { event.preventDefault(); event.stopPropagation(); quoteNow(); };
      const onAnnotate = (event) => { event.preventDefault(); event.stopPropagation(); addAnnotation(); };
      const onDocumentDown = (event) => {
        if (bar.contains(event.target)) return;
        hideBar();
      };
      const onScroll = () => hideBar();
      const onKeyDown = (event) => {
        if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
        if (String(event.key).toLowerCase() !== 'a') return;
        if (!current) return;
        event.preventDefault();
        addAnnotation();
      };

      const disposeProject = subscribeProject(() => clearAnnotations());
      const sessionStore = uiSession && uiSession.current;
      const disposeSession = sessionStore && typeof sessionStore.subscribe === 'function'
        ? sessionStore.subscribe(() => clearAnnotations())
        : () => {};

      quoteButton.addEventListener('mousedown', onBarDown);
      annotateButton.addEventListener('mousedown', onBarDown);
      quoteButton.addEventListener('click', onQuote);
      annotateButton.addEventListener('click', onAnnotate);
      closeButton.addEventListener('click', () => { panel.style.display = 'none'; });
      clearButton.addEventListener('click', () => { annotations = []; renderPanel(); });
      submitButton.addEventListener('click', submit);
      document.addEventListener('selectionchange', schedule);
      document.addEventListener('mousedown', onDocumentDown, true);
      document.addEventListener('keydown', onKeyDown);
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onScroll);

      return () => {
        clearTimeout(timer);
        quoteButton.removeEventListener('mousedown', onBarDown);
        annotateButton.removeEventListener('mousedown', onBarDown);
        quoteButton.removeEventListener('click', onQuote);
        annotateButton.removeEventListener('click', onAnnotate);
        document.removeEventListener('selectionchange', schedule);
        document.removeEventListener('mousedown', onDocumentDown, true);
        document.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onScroll);
        try { disposeProject(); } catch { /* ignore */ }
        try { disposeSession(); } catch { /* ignore */ }
        bar.remove();
        panel.remove();
      };
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

      const callFor = (sessionId) => async (method, ...args) => {
        const api = await ready();
        const response = await api[method](...args);
        if (response && response.ok === true) return response.value;
        const message = response && response.error && response.error.message
          ? response.error.message
          : 'LaTeX request failed';
        throw new Error(message);
      };
      const dialogDict = (typeof navigator !== 'undefined' && /^zh/i.test(String(navigator.language || ''))) ? ZH : EN;
      const translate = (key) => dialogDict[key] || EN[key] || key;
      const openProjectDialog = (sessionId, onOpened) => {
        showProjectDialog({
          sessionId,
          call: callFor(sessionId),
          t: translate,
          onOpened: onOpened || (() => {
            try {
              ctx.sidebarRight.openTabIn(sessionId, KIND, {});
            } catch (error) {
              console.error('[latex-studio] cannot open the Studio tab:', error);
            }
          }),
        });
      };

      ctx.inject(['commandUi'], (scope) => {
        try {
          const commands = scope && typeof scope.get === 'function' ? scope.get('commandUi') : null;
          if (commands && typeof commands.register === 'function') {
            ctx.effect(() => commands.register({
              name: 'latex-studio-open-project',
              label: () => translate('openProject'),
              icon: primitives && primitives.IconFolderOpenRegular ? primitives.IconFolderOpenRegular : undefined,
              available: () => true,
              ui: {
                kind: 'action',
                run: (session) => {
                  openProjectDialog(session && session.sessionId ? session.sessionId : '');
                },
              },
            }), 'latex-studio: composer open-project action');
          }
        } catch (error) {
          console.error('[latex-studio] composer action registration failed:', error);
        }
      });

      ctx.inject(['uiSession'], (scope) => {
        try {
          ctx.effect(() => installAnnotationTools(scope, translate), 'latex-studio: annotation tools');
        } catch (error) {
          console.error('[latex-studio] selection quote bridge failed:', error);
        }
      });

      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: TAB_ID,
        locale: NS,
        inject: (sessionId, actions) => ({
          sessionId,
          actions,
          api: apiRef,
          ready,
          openPicker: () => openProjectDialog(sessionId),
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
