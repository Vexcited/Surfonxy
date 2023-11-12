/// <reference lib="WebWorker" />

import { SurfonxyURI, URI } from "../utils/url";
import { rewriteRequest } from "../utils/request";

declare const self: ServiceWorkerGlobalScope;

export const initializeServiceWorkerListeners = () => {
  self.addEventListener("install", (event) => {
    event.waitUntil(
      // @ts-ignore
      window["__sf_original_skipWaiting"]()
    );

    console.info("sw.ts: install!");
  });
  
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        if (self.registration.navigationPreload) {
          await self.registration.navigationPreload.disable();
        }
        
        // @ts-ignore
        await window.clients["__sf_original_claim"]();
        console.info("sw.ts: activate!");
      })()
    );
  });
  
  self.addEventListener("fetch", (event) => {
    event.stopPropagation();
    event.stopImmediatePropagation();

    const shouldSkip = SurfonxyURI.create(event.request.url, undefined, window).isURLPatched();
    if (!shouldSkip) {
      event.respondWith(
        (async () => {
          const client = await self.clients.get(event.clientId);
          let base_url = null;

          if (client) {
            const uri = SurfonxyURI.create(client.url, undefined, window);
            
            if (uri.getSfURLParam() === "1") {
              // @ts-ignore
              return (window["__sf_original_fetch"] as Window["fetch"])(event.request);
            }

            base_url = URI(uri.patch());
          }
          
          const patched_request = await rewriteRequest(window, event.request, base_url);

          // @ts-ignore
          return (window["__sf_original_fetch"] as Window["fetch"])(patched_request);
        })()
      );
    }
  }, true);
};