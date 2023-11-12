import { SurfonxyElement, isElement, isInDocument } from "../../utils/elements";
import { patchDescriptorInPrototype, patchMethodInPrototype } from "../../utils/patchers";
import { SurfonxyURI, getDirectory } from "../../utils/url";
import { SurfonxyLocation } from "../../utils/location";
import { SurfonxyCookie } from "../../../cookie";
import { Base64 as B64 } from "js-base64";

export const defineProxiedLocation = (instance: SurfonxyLocation, $window: typeof window) => {
  for (const prototype of [
    $window.Window.prototype,
    $window.Document.prototype
  ]) {
    $window.Object.defineProperty(
      prototype,
      "__sfLocation",
      {
        set: function (href) {
          instance.assign(href);
        },
        get: function () {
          return instance;
        },

        configurable: false,
        enumerable: true
      }
    );
  }
};

export const checkServiceWorkerRegistration = ($window: typeof window & {
  // Type injected globals
  window_origin: string
  __sf_permalink: URL
  __sf_serviceWorkerUrl: string

  // Type possibly injected globals
  navigator: typeof window.navigator & {
    serviceWorker: typeof window.navigator.serviceWorker & {
      __sf_original_register?: typeof window.navigator.serviceWorker.register
      __sf_original_getRegistration?: typeof window.navigator.serviceWorker.getRegistration
    }
  }
}) => {
  const getRegistration = (path: string) =>
    $window.navigator.serviceWorker["__sf_original_getRegistration"]
      ? $window.navigator.serviceWorker["__sf_original_getRegistration"](path)
      : $window.navigator.serviceWorker.getRegistration(path);

  getRegistration($window.window_origin + "/")
    .then((initial_registration) => {
      // If there's no initial registration,
      // we should redirect to the permalink (service-worker register page).
      if (!initial_registration) {
        $window.location.href = $window.__sf_permalink.toString();
        return;
      }

      let isCheckingCurrentRegistration = false;
      $window.setInterval(() => {
        if (isCheckingCurrentRegistration) return;
        isCheckingCurrentRegistration = true;

        const path = getDirectory(undefined, $window);
        getRegistration(path)
          .then(current_registration => {
            if (current_registration) {
              isCheckingCurrentRegistration = false;
            }
            else {
              console.warn(`[checkServiceWorkerRegistration]: Got unregistered, trying to re-install using the default worker @ "${$window.__sf_serviceWorkerUrl}".`);
              const new_registration_url = $window.__sf_serviceWorkerUrl;
              const registration_options = { scope: path };

              const register = $window.navigator.serviceWorker["__sf_original_register"]
                ? $window.navigator.serviceWorker["__sf_original_register"](new_registration_url, registration_options)
                : $window.navigator.serviceWorker.register(new_registration_url, registration_options);
                
              register
                .then(() => {
                  console.info("[checkServiceWorkerRegistration]: Successfully re-installed the default worker.");
                  isCheckingCurrentRegistration = false;
                })
                .catch((error) => {
                  isCheckingCurrentRegistration = false;
                  console.error(error);
                });
            }
          })
          .catch((error) => {
            isCheckingCurrentRegistration = false;
            console.error(error);
          });
      }, 200);
    })
    .catch((error) => {
      console.warn(error);
    });

  return this;
};

export const initializeMutationObserver = ($window: typeof window) => {
  const observer = new $window.MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.type === "childList" &&
        mutation.addedNodes.length
      ) {
        for (const node of mutation.addedNodes) {
          if (isElement(node, $window)) {
            SurfonxyElement.create(node, $window).patchRecursively();
          }
        }
      }
    }
  });
  
  observer.observe(
    $window.document,
    {
      subtree: true,
      childList: true,
      attributes: false,
      characterData: false,
      attributeOldValue: false,
      characterDataOldValue: false
    }
  );
};

export const patchHTMLBaseElementHref = ($window: typeof window) => {
  try {
    patchDescriptorInPrototype(
      $window,
      $window.HTMLBaseElement.prototype,
      "href",
      function (original_fn) {
        // @ts-ignore
        // Here, `this` is `HTMLBaseElement`.
        return this.hasAttribute("__sfGenerated") ? "" : original_fn();
      },
      function (original_fn, args) {
        original_fn(args);
        SurfonxyElement.create($window.document.documentElement, $window).cutePatchRecursively();
      }
    );
  }
  catch (error) {
    console.error(error);
  }
};

export const patchWindowOpen = ($window: typeof window) => {
  try {
    patchMethodInPrototype($window, "open",
      function (original_fn, args) {
        const url = args[0];
        args[0] = SurfonxyURI.create(url as string, undefined, $window).patchSearchParams();
        return original_fn(args);
      },

      true, true
    );
  }
  catch (error) {
    console.error(error);
  }
};

export { patchFetch } from "../../worker/patches/globals";

export const overrideWorkers = ($window: typeof window) => {
  function patchWorker(url: string) {
    const uri = SurfonxyURI.create(url, undefined, $window);

    // if is a blob...
    if (uri.isBlob()) {
      console.info("worker is a blob, patching it...");
      // @ts-expect-error
      const sw_url = new URL("__sf.sw.js", $window.window_origin).href;
      
      const file =
      "importScripts('" + sw_url + "'); try { importScripts.call(window, '" +
      url +
      "'); } catch (e) { if (e.name === 'NetworkError') {console.warn('SurfonxyWorker: ' + e.message + '. Trying the eval method...');fetch('" +
      url +
      "').then(function (response) { if (response.ok) { response.text().then((body) => { eval.call(window, body); }); }}).catch(function (e) {console.warn('SurfonxyWorker: ' + e.message + '. Failed to fetch blob script " +
      url +
      "');}); }}";

      const blob = new Blob([file], {
        type: "application/javascript",
      });

      return URL.createObjectURL(blob);
    }

    return uri.patchSearchParams({ "parser:sw": "1" });
  }

  try {
    patchMethodInPrototype($window.URL, "revokeObjectURL",
      function () {
        console.info("Blob object URL is not revoked.");
      }
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchMethodInPrototype($window, "Worker",
      function (original_fn, args) {
        args[0] = patchWorker.call(
          // @ts-ignore
          this,
          args[0] as string
        );

        return original_fn(args);
      },

      true, false, true
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchMethodInPrototype($window, "SharedWorker",
      function (original_fn, args) {
        args[0] = patchWorker.call(
          // @ts-ignore
          this,
          args[0] as string
        );

        return original_fn(args);
      },

      true, false, true
    );
  }
  catch (error) {
    console.error(error);
  }
  try {
    patchMethodInPrototype($window.ServiceWorkerContainer.prototype, "register",
      function (original_fn, args) {
        console.info("sw register called");

        return (
          new Promise((resolve) => {
            setTimeout(() => {
              args[0] = patchWorker.call(
                // @ts-ignore
                this,
                args[0] as string
              );

              args[1] = (args[1] || {}) as { scope?: string };
              // @ts-ignore
              args[1].scope = getDirectory(args[1].scope, $window);
              console.info("base sw register called");
              resolve(original_fn(args));
            }, 5000);
          })
        );
      }
    );
  }
  catch (error) {
    console.error(error);
  }
};

export const patchServiceWorkerContainerGetRegistration = ($window: typeof window) => {
  try {
    patchMethodInPrototype($window.ServiceWorkerContainer.prototype, "getRegistration",
      function (original_fn, args) {
        args[0] = getDirectory(args[0] as string | null, $window);
        return (
          original_fn(args)
        );
      }
    );
  }
  catch (error) {
    console.error(error);
  }
};

// we reuse those
export { patchServiceWorkerRegistrationScope } from "../../worker/patches/globals";

/**
 * Patches History.replaceState and History.pushState 
 */
export const patchHistoryMethodsState = ($window: typeof window) => {
  try {
    patchMethodInPrototype($window.History.prototype, "replaceState",
      function (original_fn, args) {
        if (2 in args) {
          args[2] = SurfonxyURI.create(args[2] as string, undefined, $window).patchSearchParams();
        }

        original_fn(args);
        // @ts-ignore
        ($window.__sfLocation as SurfonxyLocation).refreshBaseElement();
      }
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchMethodInPrototype($window.History.prototype, "pushState",
      function (original_fn, args) {
        if (2 in args) {
          args[2] = SurfonxyURI.create(args[2] as string, undefined, $window).patchSearchParams();
        }

        original_fn(args);
        // @ts-ignore
        ($window.__sfLocation as SurfonxyLocation).refreshBaseElement();
      }
    );
  }
  catch (error) {
    console.error(error);
  }
};

export const overrideNavigatorRegisterProtocolHandler = ($window: typeof window) => {
  try {
    patchMethodInPrototype($window.Navigator.prototype, "registerProtocolHandler",
      function () {
        console.warn("No protocol handlers can be registered");
      }
    );
  }
  catch (error) {
    console.error(error);
  }
};

export const patchDocumentCookie = ($window: typeof window) => {
  try {
    patchDescriptorInPrototype(
      $window,
      [
        $window.Document.prototype,
        $window.HTMLDocument.prototype
      ],
      "cookie",
      function (getter) {
        return new SurfonxyCookie(
          getter() as string,
          // @ts-expect-error
          ($window.__sfLocation as SurfonxyLocation).hostname,
          $window.location.hostname
        ).proxyGetter();
      },
      function (setter, cookie_string) {
        cookie_string = new SurfonxyCookie(
          cookie_string as string,
          // @ts-expect-error
          ($window.__sfLocation as SurfonxyLocation).hostname,
          $window.location.hostname
        ).proxySetter();

        if (cookie_string !== null) setter(cookie_string);
      },

      true, true
    );

    patchDescriptorInPrototype(
      $window,
      [
        $window.Document.prototype,
        $window.HTMLDocument.prototype
      ],
      "__sf_original_cookie",
      function (getter) {
        return new SurfonxyCookie(
          getter() as string,
          // @ts-expect-error
          ($window.__sfLocation as SurfonxyLocation).hostname,
          $window.location.hostname
        ).getInternalCookies();
      },
      function (setter, cookie_string) {
        cookie_string = new SurfonxyCookie(
          cookie_string as string,
          // @ts-expect-error
          ($window.__sfLocation as SurfonxyLocation).hostname,
          $window.location.hostname
        ).Vt();

        if (cookie_string !== null) setter(cookie_string);
      },
      false
    );
  }
  catch (error) {
    console.error(error);
  }  
};

export const patchDocumentDomain = ($window: typeof window) => {
  try {
    patchDescriptorInPrototype(
      $window,
      [
        $window.Document.prototype,
        $window.HTMLDocument.prototype
      ],
      "domain",
      function () {
        // @ts-ignore
        // Here, `this` is `Document`.
        if ("__sf_domain" in this) {
          // @ts-ignore
          return this["__sf_domain"];
        }

        // @ts-expect-error
        return ($window.__sfLocation as SurfonxyLocation)
          .patchedURI()
          .host();
      },
      // Don't call the setter,
      // it's useless :)
      function (setter, value) {
        // @ts-ignore
        this["__sf_domain"] = value;
      }
    );
  }
  catch (error) {
    console.error(error);
  }
};

/**
 * Overrides the `integrity` on script and link tags.
 */
export const overrideScriptLinkIntegrity = ($window: typeof window) => {
  try {
    patchDescriptorInPrototype(
      $window,
      [
        $window.HTMLScriptElement.prototype,
        $window.HTMLLinkElement.prototype
      ],
      "integrity",
      function () {
        return null;
      },
      function () {}
    );
  }
  catch (error) {
    console.error(error);
  }
};

export const patchDocumentURL = ($window: typeof window) => {
  try {
    patchDescriptorInPrototype(
      $window,
      [
        $window.Document.prototype,
        $window.HTMLDocument.prototype
      ],
      "URL",
      function () {
        // @ts-expect-error
        return ($window.__sfLocation as SurfonxyLocation).href;
      },
      function () {}
    );
  }
  catch (error) {
    console.error(error);
  }
};

/**
 * Patches the `document.documentURI` property.
 */
export const patchDocumentURI = ($window: typeof window) => {
  try {
    patchDescriptorInPrototype(
      $window,
      [
        $window.Document.prototype,
        $window.HTMLDocument.prototype
      ],
      "documentURI",
      function () {
        // @ts-expect-error
        return ($window.__sfLocation as SurfonxyLocation).href;
      },
      function () {}
    );
  }
  catch (error) {
    console.error(error);
  }
};

export { patchXMLHttpRequest } from "../../worker/patches/globals";

/**
 * A lot of HTML patches.
 */
export const patchNodeAndElement = ($window: typeof window) => {
  try {
    patchMethodInPrototype($window.Node.prototype, "appendChild",
      function (original_fn, args) {
        const node = original_fn(args) as Node;
        // @ts-expect-error
        // Here, `this` is `Node`.
        if (isElement(args[0], $window) && isInDocument(this, $window)) {
          SurfonxyElement.create(args[0], $window).patchRecursively();
        }
        
        return node;
      },

      true, false
    );
  }
  catch (error) {
    console.error(error);
  }
  
  try {
    patchMethodInPrototype(
      $window.Node.prototype,
      "replaceChild",
      function (original_fn, args) {
        const node = original_fn(args);
        // @ts-expect-error
        if (isElement(args[0], $window) && isInDocument(this, $window)) {
          SurfonxyElement.create(args[0], $window).patchRecursively();
        }

        return node;
      },

      true, false
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchMethodInPrototype(
      $window.Node.prototype,
      "insertBefore",
      function (original_fn, args) {
        const node = original_fn(args);
        // @ts-expect-error
        if (isElement(args[0], $window) && isInDocument(this, $window)) {
          SurfonxyElement.create(args[0], $window).patchRecursively();
        }

        return node;
      },
      
      true, false
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchMethodInPrototype(
      $window.Element.prototype,
      "after",
      function (original_fn, args) {
        const el = original_fn(args);

        for (const arg of args) {
          // @ts-expect-error
          if (isElement(arg, $window) && isInDocument(this, $window)) {
            SurfonxyElement.create(arg, $window).patchRecursively();
          }
        }

        return el;
      },

      true, false
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchMethodInPrototype(
      $window.Element.prototype,
      "before",
      function (original_fn, args) {
        const el = original_fn(args);
        for (const arg of args) {
          // @ts-expect-error
          if (isElement(arg, $window) && isInDocument(this, $window)) {
            SurfonxyElement.create(arg, $window).patchRecursively();
          }
        }

        return el;
      },

      true, false
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchMethodInPrototype(
      $window.Element.prototype,
      "replaceWith",
      function (original_fn, args) {
        const el = original_fn(args);
        for (const arg of args) {
          // @ts-expect-error
          if (isElement(arg, $window) && isInDocument(this, $window)) {
            SurfonxyElement.create(arg, $window).patchRecursively();
          }
        }

        return el;
      },

      true, false
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchMethodInPrototype(
      $window.Element.prototype,
      "insertAdjacentElement",
      function (original_fn, args) {
        const el = original_fn(args);
        // @ts-expect-error
        if (isElement(args[1], $window) && isInDocument(this, $window)) {
          SurfonxyElement.create(args[1], $window).patchRecursively();
        }

        return el;
      },

      true, false
    );
  }
  catch (error) {
    console.error(error);
  }
  try {
    patchMethodInPrototype(
      $window.Element.prototype,
      "append",
      function (original_fn, args) {
        const el = original_fn(args);
        for (const arg of args) {
          // @ts-expect-error
          if (isElement(arg, $window) && isInDocument(this, $window)) {
            SurfonxyElement.create(arg, $window).patchRecursively();
          }
        }

        return el;
      },

      true, false
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchMethodInPrototype(
      $window.Element.prototype,
      "prepend",
      function (original_fn, args) {
        const el = original_fn(args);
        for (const arg of args) {
          // @ts-expect-error
          if (isElement(arg, $window) && isInDocument(this, $window)) {
            SurfonxyElement.create(arg, $window).patchRecursively();

          }
        }

        return el;
      },

      true, false
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchMethodInPrototype(
      $window.Element.prototype,
      "insertAdjacentHTML",
      function (original_fn, args) {
        const el = original_fn(args);
        // @ts-expect-error
        if (args[1] && isInDocument(this, $window)) {
          SurfonxyElement.create(
            $window.document.documentElement,
            $window
          ).patchRecursively();
        }

        return el;
      },

      true, false
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchDescriptorInPrototype(
      $window,
      $window.Element.prototype,
      "innerHTML",
      function (getter) {
        return getter();
      },
      function (setter, new_value) {
        const value = setter(new_value);
        // @ts-expect-error
        if (new_value && isInDocument(this, $window)) {
          SurfonxyElement.create(
            $window.document.documentElement,
            $window
          ).patchRecursively();
        }

        return value;
      }
    );
  }
  catch (error) {
    console.error(error);
  }
  try {
    patchDescriptorInPrototype(
      $window,
      $window.Element.prototype,
      "outerHTML",
      function (getter) {
        return getter();
      },
      function (setter, new_value) {
        const value = setter(new_value);
        // @ts-expect-error
        if (new_value && isInDocument(this, $window)) {
          SurfonxyElement.create(
            $window.document.documentElement,
            $window
          ).patchRecursively();
        }
        
        return value;
      }
    );
  }
  catch (error) {
    console.error(error);
  }
};

export const patchWebSocket = ($window: typeof window) => {
  try { // Patch the prototype's URL.
    patchDescriptorInPrototype($window, $window.WebSocket.prototype, "url",
      function (getter) {
        const value = getter() as string;
        const uri = new URL(value);

        // When we have a `u` parameter, decode it
        // and set it since it's most likely the original URL.
        if (uri.searchParams.has("u")) {
          const encoded_url = uri.searchParams.get("u") as string;
          return B64.decode(encoded_url);
        }
        
        // If there's no `u` parameter, return the original value.
        return value;
      },
      // Nothing changes when using the setter.
      function () { /** No-op. */ }
    );
  }
  catch (error) {
    console.error(error);
  }

  // All the patches related to the original `WebSocket` prototype
  // should be before this patch because after,
  // the prototype will be *overwritten*.
  try { // Patch the main WebSocket constructor.
    patchMethodInPrototype($window, "WebSocket",
      function (original_fn, args) {
        const protocol = $window.location.protocol === "https:" ? "wss:" : "ws:";
        // @ts-expect-error
        const origin = B64.encode(($window.__sfLocation as SurfonxyLocation).origin);
        
        args[0] = `${protocol}//${$window.location.host}/__sfw__?u=${B64.encode(args[0] as string)}&o=${origin}`;
        return original_fn(args);
      },

      true, false, true
    );
    
    // Prevents to be edited.
    $window.WebSocket.toString = () => "function WebSocket() { [native code] }";

    // Make sure `WebSocket.OPEN === 1` 
    patchDescriptorInPrototype($window, $window.WebSocket, "OPEN",
      function () {
        return 1;
      },
      function () { /** No-op. */ },
      
      false, false
    );

    // Make sure `WebSocket.CONNECTING === 0` 
    patchDescriptorInPrototype($window, $window.WebSocket, "CONNECTING",
      function () {
        return 0;
      },
      function () { /** No-op. */ },
      
      false, false
    );

    // Make sure `WebSocket.CLOSING === 2` 
    patchDescriptorInPrototype($window, $window.WebSocket, "CLOSING",
      function () {
        return 2;
      },
      function () { /** No-op. */ },
      
      false, false
    );

    // Make sure `WebSocket.CLOSED === 3` 
    patchDescriptorInPrototype($window, $window.WebSocket, "CLOSED",
      function () {
        return 3;
      },
      function () { /** No-op. */ },
      
      false, false
    );
  }
  catch (error) {
    console.error("[patches/globals]: Failed to patch WebSocket.", error);
  }
};