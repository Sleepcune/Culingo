var runtimeReady;
function install() {}
function uninstall() {}
function startup(data) {
  var scope = this;
  runtimeReady = (async function () {
    await Zotero.initializationPromise;
    await Zotero.uiReadyPromise;
    var window = Zotero.getMainWindow();
    scope.window = window;
    scope.document = window.document;
    scope.navigator = window.navigator;
    scope.performance = { now: () => Date.now() };
    scope.AbortController = window.AbortController;
    scope.DOMException = window.DOMException;
    Services.scriptloader.loadSubScript(data.rootURI + 'runtime.js', scope);
    await CuLingoRuntime.startup(data);
  })();
  runtimeReady.catch(error => { Zotero.logError(error); });
}
async function shutdown(data, reason) {
  try { await runtimeReady; } catch(error) { Zotero.logError(error); }
  if (typeof CuLingoRuntime !== 'undefined') {
    try { await CuLingoRuntime.shutdown(); } catch(error) { Zotero.logError(error); }
  }
}
async function onMainWindowLoad({window}) {
  await runtimeReady; CuLingoRuntime.attachWindow(window);
}
function onMainWindowUnload({window}) {
  if (typeof CuLingoRuntime !== 'undefined') CuLingoRuntime.detachWindow(window);
}
