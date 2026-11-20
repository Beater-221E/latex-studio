/**
 * LaTeX Studio — Host half.
 *
 * Registers the `latexStudio` capability (workspace discovery, file read/write,
 * project builds) and publishes it to the browser through a Typert contribution
 * in the `latex` namespace. The Client half lives in `./client`.
 */
import { createLatexService } from './src/host/service.js';
import { HOST_TYPERT_CONTRIBUTION, assertContributionShape } from './src/host/typert.js';

export const name = 'latex-studio';

export function apply(ctx, config = {}) {
  const service = createLatexService(ctx, config || {});
  // The Typert Gateway resolves this Host service through a *visible* binding
  // on the service object (the same one `TypertRemoteService` installs in its
  // constructor). Without it every Client call fails at the gateway with
  // "Service \"latexStudio\" has no visible typertRemote binding".
  service.typertRemote = Object.freeze({
    service,
    serviceKey: 'latexStudio',
    namespace: 'latex',
  });
  ctx.effect(() => ctx.provide('latexStudio', service), 'latex-studio: latexStudio service');

  ctx.inject(['typert'], (scope) => {
    try {
      assertContributionShape(HOST_TYPERT_CONTRIBUTION);
      scope.typert.register(HOST_TYPERT_CONTRIBUTION);
      ctx.logger?.info?.('[latex-studio] typert remote registered: latex/{discover,readFile,readBytes,writeFile,compile,status,pickDirectory,sshHosts,remoteHome,remoteList,listDir}');
    } catch (error) {
      ctx.logger?.error?.(`[latex-studio] typert registration failed: ${error && error.message ? error.message : error}`);
    }
  });
}
