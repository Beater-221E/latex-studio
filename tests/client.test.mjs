import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The Client half is a browser module bundle loaded through
 * `window.__ModuleLoader__`. This test evaluates it with stub modules and a
 * stub Cordis context, then checks every registration it publishes: a missing
 * one means a button/tab/menu entry would silently disappear at runtime.
 */
function loadClient() {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  let spec;
  const win = {
    __ModuleLoader__: { load: (value) => { spec = value; } },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  // eslint-disable-next-line no-new-func
  new Function('window', source)(win);
  return spec;
}

const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useEffect: () => {},
  useRef: (value) => ({ current: value }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  Fragment: 'Fragment',
};
const ReactDOM = {
  createRoot: () => ({ render() {}, unmount() {} }),
  createPortal: (element) => element,
  render() {},
  unmountComponentAtNode() {},
};
const primitives = { IconFolderOpenRegular: function FolderIcon() { return null; } };
const zod = { z: { any: () => ({}) } };

test('the client bundle registers the Studio tab and asks for its services', () => {
  const spec = loadClient();
  assert.equal(spec.id, '@local/latex-studio');
  assert.equal(typeof spec.factory, 'function');

  const registered = { tabTypes: [], slots: [], effects: 0, injected: [], remoteMounted: false, actions: [] };
  const commandUi = { register: (contribution) => { registered.actions.push(contribution); return () => {}; } };
  const fakeRemote = { readBytes: async () => ({}) };

  const ctx = {
    effect: (fn) => { registered.effects += 1; fn(); return () => {}; },
    locale: { register: () => () => {} },
    sidebarRightTabs: { register: (definition) => { registered.tabTypes.push(definition); return () => {}; } },
    slots: {
      inject: (_name, callback) => { callback(); return () => {}; },
      register: (definition) => { registered.slots.push(definition); return () => {}; },
    },
    sidebarRight: {
      openResource: () => {},
      openTab: () => {},
      openTabIn: () => {},
      closeIn: () => {},
    },
    remote: { $mount: async () => { registered.remoteMounted = true; }, latex: fakeRemote },
    inject: (deps, callback) => {
      registered.injected.push([...deps]);
      if (deps.includes('commandUi')) callback({ get: (name) => (name === 'commandUi' ? commandUi : undefined) });
      else if (deps.includes('uiSession')) callback({ uiSession: { current: null } });
      else if (deps.includes('remote.latex')) callback({ remote: { latex: fakeRemote } });
      else callback({ typert: { register() {} } });
    },
  };

  const module = spec.factory((name) => {
    if (name === 'react') return React;
    if (name === 'react-dom') return ReactDOM;
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
    if (name === 'zod') return zod;
    throw new Error(`unexpected require: ${name}`);
  });
  module.apply(ctx);

  const studio = registered.tabTypes.find((definition) => definition.kind === 'latex-studio');
  assert.ok(studio, 'latex-studio tab type is registered');
  assert.ok(Array.isArray(studio.guide) && studio.guide.length > 0, 'the guide lists the Studio tab');

  const body = registered.slots.find((slot) => slot.name === 'sidebar.right.pane.tab' && slot.key === '@local/latex-studio');
  assert.ok(body, 'the Studio pane body is registered');
  assert.equal(typeof body.inject, 'function');

  const action = registered.actions.find((entry) => entry.name === 'latex-studio-open-project');
  assert.ok(action, 'the composer + menu action is registered');
  assert.equal(action.ui.kind, 'action');
  assert.equal(typeof action.ui.run, 'function');
  assert.equal(typeof action.label(), 'string');

  assert.ok(!registered.slots.some((slot) => slot.name === 'conversation.view'), 'no permanent conversation View');
  assert.ok(!registered.slots.some((slot) => slot.name === 'sidebar.workspaces.session.menu.item'), 'session menu no longer carries the action');
  assert.ok(registered.injected.some((deps) => deps.includes('commandUi')), 'the composer action asks for commandUi');
  assert.ok(registered.injected.some((deps) => deps.includes('uiSession')), 'the selection bridge asks for uiSession');
  assert.equal(registered.remoteMounted, true, 'the Typert remote is mounted');
});
