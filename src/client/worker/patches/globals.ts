import type { SurfonxyLocation, SurfonxyWorkerLocation } from "../../utils/location";

import { patchDescriptorInPrototype, patchMethodInPrototype } from "../../utils/patchers";
import { rewriteRequest } from "../../utils/request";
import { SurfonxyURI, URI } from "../../utils/url";

export const defineProxiedLocation = (instance: SurfonxyWorkerLocation, $window: typeof window) => {
  Object.defineProperty($window, "__sfLocation", {
    get: function () {
      return instance;
    },
  
    configurable: false,
    enumerable: true
  });
};

export const patchServiceWorkerRegistrationScriptURL = ($window: typeof window) => {
  function patchGetter(original_fn: () => unknown) {
    const value = original_fn();

    if (value) {
      try {
        patchDescriptorInPrototype(
          $window,
          value,
          "scriptURL",
          function () {
            // @ts-ignore
            return ($window.__sfLocation as SurfonxyLocation).href;
          },
          function () {}
        );
      }
      catch (error) {
        console.error(error);
      }
    }
    return value;
  }

  try {
    patchDescriptorInPrototype(
      $window,
      $window.ServiceWorkerRegistration.prototype,
      "active",
      patchGetter,
      function () {}
    );
  }
  catch (error) {
    console.error(error);
  }
  try {
    patchDescriptorInPrototype(
      $window,
      $window.ServiceWorkerRegistration.prototype,
      "installing",
      patchGetter,
      function () {}
    );
  }
  catch (error) {
    console.error(error);
  }
  try {
    patchDescriptorInPrototype(
      $window,
      $window.ServiceWorkerRegistration.prototype,
      "waiting",
      patchGetter,
      function () {}
    );
  }
  catch (error) {
    console.error(error);
  }
};

/**
 * Patches the origin.
 */
export const patchServiceWorkerRegistrationScope = ($window: typeof window) => {
  try {
    patchDescriptorInPrototype(
      $window,
      $window.ServiceWorkerRegistration.prototype,
      "scope",
      function (original_fn) {
        const value = URI(original_fn() as string);
        // @ts-ignore
        value.origin(($window.__sfLocation as SurfonxyLocation).origin);

        return value.toString();
      },
      function () {}
    );
  }
  catch (error) {
    console.error(error);
  }
};

export const patchFetch = ($window: typeof window) => {
  try {
    patchMethodInPrototype($window, "fetch",
      function (original_fn, args) {
        let req = args[0] as Request | string;

        if (!(req instanceof Request)) {
          req = new Request(req);
        }

        return rewriteRequest($window, req).then(function (patched_req) {
          const req_init = args[1] as RequestInit | undefined;

          if (typeof req_init === "object") {
            req_init.mode = patched_req.mode;
            req_init.credentials = patched_req.credentials;
            req_init.cache = patched_req.cache;
            req_init.referrer = patched_req.referrer;
            delete req_init.integrity;
            args[1] = req_init;
          }

          args[0] = patched_req;
          return original_fn(args);
        });
      },
      true,
      true
    );
  }
  catch (error) {
    console.error(error);
  }
};

export const patchXMLHttpRequest = ($window: typeof window) => {
  // According to MDN :
  // > This feature is available in Web Workers,
  // > **except for Service Workers**
  if ("XMLHttpRequest" in $window) {
    try {
      patchMethodInPrototype(
        $window.XMLHttpRequest.prototype,
        "open",
        function (original_fn, args) {
          args[1] = SurfonxyURI.create(args[1] as string, undefined, $window).patchSearchParams();
          return original_fn(args);
        }
      );
    }
    catch (error) {
      console.error(error);
    }
    
    try {
      patchDescriptorInPrototype(
        $window,
        $window.XMLHttpRequest.prototype,
        "responseURL",
        function (original_fn) {
          return SurfonxyURI.create(original_fn() as string, undefined, $window).patch();
        },
        function () {}
      );
    }
    catch (error) {
      console.error(error);
    }
  }
};