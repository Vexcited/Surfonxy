/// <reference lib="WebWorker" />
declare const self: WorkerGlobalScope;

import { initializeCacheOverride } from "./worker/cacheOverride";
import { initializePostMessageOverride } from "./utils/postMessageOverride";
import { initializeServiceWorkerListeners } from "./worker/sw";

import {
  defineProxiedLocation,
  patchFetch,
  patchServiceWorkerRegistrationScope,
  patchServiceWorkerRegistrationScriptURL,
  patchXMLHttpRequest
} from "./worker/patches/globals";

import {
  patchClientsClaim,
  patchClientsOpenWindow,
  patchImportScripts,
  patchSkipWaiting,
  patchWindowClientNavigate
} from "./worker/patches/service-worker";

import { rewriteGetterPrototypeForURL } from "./utils/patchers";
import { SurfonxyWorkerLocation } from "./utils/location";

// @ts-ignore
// Allows us to use `window.` in our functions.
self.window = self;

// @ts-expect-error
// We set the `__surfonxied` property to be able to detect
// if the worker is already initialized.
if (!window.__surfonxied) {
  // @ts-expect-error
  window.__surfonxied = "1";

  // @ts-expect-error
  window.window_hostname = window.location.hostname;
  // @ts-expect-error
  window.window_origin = window.location.origin;

  initializeCacheOverride();
  initializePostMessageOverride(window);
  
  // Define `window.__sfLocation`.
  defineProxiedLocation(SurfonxyWorkerLocation.create(window), window);
  
  // @ts-expect-error
  window.origin = window.__sfLocation.origin;
  
  // Apply the global patches.
  patchServiceWorkerRegistrationScriptURL(window);
  patchServiceWorkerRegistrationScope(window);
  patchFetch(window);
  patchXMLHttpRequest(window);
  
  // Apply service-worker specific patches.
  if ("ServiceWorkerGlobalScope" in window) {

    // const broadcast = new BroadcastChannel("__sf_broadcast_channel");
    // setInterval(() => {
    //   broadcast.postMessage("info");
    // }, 1000);

    // broadcast.onmessage = (event) => {
    //   console.log("SF_SW:", event.data);
    // };

    patchWindowClientNavigate();
    patchClientsOpenWindow();
    patchSkipWaiting();
    patchClientsClaim();
    patchImportScripts();
  
    // Initialize the service worker !
    initializeServiceWorkerListeners();
  
    try {
      rewriteGetterPrototypeForURL(
        window,
        window.Client.prototype,
        "url",
        true
      );
    }
    catch (error) {
      console.error(error);
    }
  }
}
