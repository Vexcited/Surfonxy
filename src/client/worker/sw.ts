/// <reference lib="WebWorker" />

import { SurfonxyURI, URI } from "../utils/url";
import { rewriteRequest } from "../utils/request";
import { SurfonxyCookie } from "../../cookie";

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

  const broadcast_ids: Record<string, (all_cookies: string) => void> = {};
  const broadcast = new BroadcastChannel("sf-cookie-broadcast-channel");
  
  broadcast.onmessage = (event) => {
    if (event.data.type === "__SF_GET_DOCUMENT.COOKIE__") {
      if (event.data.id in broadcast_ids) {
        broadcast_ids[event.data.id](event.data.cookies);
      }
    }
  };

  const getCookies = async (client: Client, uri: SurfonxyURI) => new Promise<string>(resolve => {
    // (a random number)-(current time)
    // we use that combination to make sure it's very unique on the moment.
    const messageID = Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
    broadcast_ids[messageID] = (all_cookies) => {
      const parser = new SurfonxyCookie(
        all_cookies,
        uri.uri?.hostname() ?? "",
        new URL(client.url).hostname
      );

      resolve(parser.proxyGetter());
    };

    client.postMessage({
      type: "__SF_GET_DOCUMENT.COOKIE__",
      id: messageID
    });
  });
  
  self.addEventListener("fetch", (event) => {
    event.stopPropagation();
    event.stopImmediatePropagation();
    const original_request = event.request;

    const original_uri = SurfonxyURI.create(original_request.url, undefined, window);

    if (!original_uri.isURLPatched()) {
      event.respondWith(
        (async () => {
          const client = await self.clients.get(event.clientId);
          let base_url: URI | null = null;
          let cookies = "";

          if (client) {
            cookies = await getCookies(client, original_uri);
            const uri = SurfonxyURI.create(client.url, undefined, window);
            
            if (uri.getSfURLParam() === "1") {
              // @ts-ignore
              return (window["__sf_original_fetch"] as Window["fetch"])(original_request);
            }

            base_url = URI(uri.patch());
          }
          
          const patched_request = await rewriteRequest(window, original_request, base_url);
          patched_request.headers.set("X-SF-Cookie", cookies);

          // @ts-ignore
          return (window["__sf_original_fetch"] as Window["fetch"])(patched_request);
        })()
      );
    }
    // else let's just omit the cookies
    // ONLY if the request is fully patched
    else if (original_uri.isCorrect() && typeof original_uri.getSfURLParam() === "string" && original_uri.getSfURLParam() !== "1") {
      event.respondWith(
        (async () => {
          const client = await self.clients.get(event.clientId);
          let base_url: URI | null = null;
          let cookies = "";

          if (client) {
            cookies = await getCookies(client, original_uri);

            const uri = SurfonxyURI.create(client.url, undefined, window);
            base_url = URI(uri.patch());
          }

          const request_body = await original_request.clone().text();
          let patched_referrer = "";

          try {
            if (original_request.referrer) {
              const referrer_uri = SurfonxyURI.create(original_request.referrer, undefined, window);
          
              // check if the URL parameter is really defined
              if (referrer_uri.getSfURLParam() !== "1") {
                patched_referrer = referrer_uri.patchSearchParams({}, base_url) as string;
              }
            }
          }
          catch (error) {
            // @ts-ignore
            console.error(error.message + " (referrer)");
          }

          const patched_request = new Request(original_request.url, {
            method: original_request.method,
            headers: new Headers(original_request.headers),
            mode: "cors",
            credentials: "omit", // remove cookies
            // credentials: "include", // keep cookies
            cache: "default",
            redirect: original_request.redirect,
            referrer: patched_referrer,
            body:
              "GET" !== original_request.method &&
              "HEAD" !== original_request.method &&
              request_body
                ? request_body
                : void 0
          });

          patched_request.headers.set("X-SF-Cookie", cookies);

          // @ts-ignore
          return (window["__sf_original_fetch"] as Window["fetch"])(patched_request);
        })()
      );
    }
  }, true);
};