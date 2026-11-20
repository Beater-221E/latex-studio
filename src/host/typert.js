/**
 * Typert contribution: the wire contract that lets the browser half call this
 * plugin's Host service. The Host describes src-json codecs (values are already
 * validated here); the Client mounts the same descriptors with strict codecs.
 *
 * Endpoints live in the `latex` namespace and resolve through the `latexStudio`
 * service registered by index.js.
 */
export const REMOTE_PACKAGE = '@local/latex-studio';
export const REMOTE_SERVICE = 'latexStudio';
export const REMOTE_NAMESPACE = 'latex';

const SRC_JSON = { mode: 'src-json' };

function descriptor(method, parameters, resultType) {
  return {
    id: `${REMOTE_PACKAGE}#${REMOTE_NAMESPACE}/${method}`,
    service: REMOTE_SERVICE,
    namespace: REMOTE_NAMESPACE,
    method,
    invocation: { kind: 'direct' },
    parameters: parameters.map((name) => ({ name, wire: name, source: 'json', codec: SRC_JSON })),
    result: SRC_JSON,
  };
}

export const HOST_TYPERT_CONTRIBUTION = Object.freeze({
  package: REMOTE_PACKAGE,
  face: 'host',
  schemas: [],
  invocations: Object.freeze([
    Object.freeze(descriptor('discover', ['sessionId', 'projectPath'], 'DiscoverResult')),
    Object.freeze(descriptor('readFile', ['sessionId', 'path'], 'ReadFileResult')),
    Object.freeze(descriptor('writeFile', ['sessionId', 'path', 'text'], 'WriteFileResult')),
    Object.freeze(descriptor('compile', ['sessionId', 'main', 'engine'], 'CompileResult')),
    Object.freeze(descriptor('status', ['sessionId'], 'StatusResult')),
  ]),
  model: undefined,
});

/** Structural sanity check before registering, so a typo fails loudly at activation. */
export function assertContributionShape(contribution) {
  if (!contribution || typeof contribution !== 'object') throw new Error('typert contribution must be an object');
  const list = contribution.invocations;
  if (!Array.isArray(list) || list.length === 0) throw new Error('typert contribution needs invocations');
  const endpoints = new Set();
  for (const item of list) {
    for (const field of ['id', 'service', 'namespace', 'method']) {
      if (typeof item[field] !== 'string' || item[field].length === 0) throw new Error(`typert: invocation is missing ${field}`);
    }
    const endpoint = `${item.namespace}/${item.method}`;
    if (endpoints.has(endpoint)) throw new Error(`typert: endpoint "${endpoint}" repeats`);
    endpoints.add(endpoint);
    if (!Array.isArray(item.parameters)) throw new Error(`typert: invocation "${item.id}" has no parameter list`);
    if (!item.result || typeof item.result !== 'object') throw new Error(`typert: invocation "${item.id}" has no result codec`);
  }
  return true;
}
