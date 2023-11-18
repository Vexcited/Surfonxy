/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { checkServiceWorkerRegistration, defineProxiedLocation, initializeMutationObserver, overrideNavigatorRegisterProtocolHandler, overrideScriptLinkIntegrity, overrideWorkers, patchDocumentCookie, patchDocumentDomain, patchDocumentURI, patchDocumentURL, patchFetch, patchHTMLBaseElementHref, patchHistoryMethodsState, patchNodeAndElement, patchServiceWorkerContainerGetRegistration, patchServiceWorkerRegistrationScope, patchWebSocket, patchWindowOpen, patchXMLHttpRequest } from "./globals";
import { initializePostMessageOverride } from "../../utils/postMessageOverride";
import { SurfonxyLocation } from "../../utils/location";
import { SurfonxyElement } from "../../utils/elements";
import { rewriteElementAttributeForURL, rewriteGetterPrototypeForURL } from "../../utils/patchers";
import { overrideElementPrototype, overrideFormActions, overrideMetaElement } from "./dom";

/**
 * @param $window - The window to initialize everything.
 */
export const initializeClient = (
  $window: typeof window,
  local_hostname: string = $window.location.hostname,
  local_origin: string = $window.location.origin,
  href: string = $window.location.href
) => {
  // @ts-expect-error
  // We set the `__surfonxied` property to be able to detect
  // if the main script is already initialized.
  if (!$window.__surfonxied) {
    // @ts-expect-error
    $window.__surfonxied = "1";

    // @ts-expect-error
    $window.window_hostname = local_hostname;
    // @ts-expect-error
    $window.window_origin = local_origin;
    
    initializePostMessageOverride($window);

    // Define `$window.__sfLocation`.
    defineProxiedLocation(SurfonxyLocation.create(href, undefined, $window), $window);

    // const broadcast = new BroadcastChannel("__sf_broadcast_channel");
    // broadcast.onmessage = (event) => {
    //   if (event.data === "info") {
    //     broadcast.postMessage({
    //       // @ts-expect-error
    //       location_href: ($window.__sfLocation as SurfonxyLocation).href
    //     });
    //   }
    // };

    // @ts-expect-error
    checkServiceWorkerRegistration($window);

    const broadcast = new BroadcastChannel("sf-cookie-broadcast-channel");
    navigator.serviceWorker.onmessage = (event) => {
      if (event.data.type === "__SF_GET_DOCUMENT.COOKIE__") {
        broadcast.postMessage({
          type: "__SF_GET_DOCUMENT.COOKIE__",
          id: event.data.id,
          // @ts-expect-error
          cookies: document.getCookies()
        });
      }
    };

    initializeMutationObserver($window);
    patchHTMLBaseElementHref($window);
    patchWindowOpen($window);
    patchFetch($window);
    overrideWorkers($window);
    patchServiceWorkerContainerGetRegistration($window);
    patchServiceWorkerRegistrationScope($window);
    patchHistoryMethodsState($window);
    overrideNavigatorRegisterProtocolHandler($window);
  
    // @ts-expect-error
    $window.origin = ($window.__sfLocation as SurfonxyLocation).origin;
  
    patchDocumentCookie($window);
    patchDocumentDomain($window);
    overrideScriptLinkIntegrity($window);
    patchDocumentURL($window);
    patchDocumentURI($window);
    patchXMLHttpRequest($window);
    patchNodeAndElement($window);
    patchWebSocket($window);

    // patch elements on first run.
    SurfonxyElement.create($window.document.documentElement, $window).patchRecursively();

    try {
      rewriteGetterPrototypeForURL(
        $window,
        $window.ServiceWorker.prototype,
        "scriptURL",
        true
      );
    }
    catch (error) {
      console.error(error);
    }

    try {
      rewriteGetterPrototypeForURL(
        $window,
        $window.HTMLMediaElement.prototype,
        "currentSrc",
        true
      );
    }
    catch (error) {
      console.error(error);
    }

    try {
      rewriteGetterPrototypeForURL(
        $window,
        [
          $window.Document.prototype,
          $window.HTMLDocument.prototype
        ],
        "referrer",
        true, true
      );
    }
    catch (error) {
      console.error(error);
    }

    overrideFormActions($window);
    overrideElementPrototype($window.HTMLAnchorElement.prototype, $window);
    overrideElementPrototype($window.HTMLAreaElement.prototype, $window);
    overrideMetaElement($window);

    try {
      rewriteElementAttributeForURL(
        $window,
        $window.HTMLIFrameElement.prototype,
        "src",
        false, true
      );
    }
    catch (error) {
      console.error(error);
    }

    try {
      rewriteElementAttributeForURL(
        $window,
        $window.HTMLMediaElement.prototype,
        "src",
        false, true
      );
    }
    catch (error) {
      console.error(error);
    }

    try {
      rewriteElementAttributeForURL(
        $window,
        $window.HTMLSourceElement.prototype,
        "src",
        false, true
      );
    }
    catch (error) {
      console.error(error);
    }

    try {
      rewriteElementAttributeForURL(
        $window,
        $window.SVGUseElement.prototype,
        "href",
        false, true
      );
    }
    catch (error) {
      console.error(error);
    }
  
  }
  else {
    console.info("sf_client: The script is already initialized.");
  }
};