import { SurfonxyURI, URI } from "./url";
import { patchDescriptorInPrototype } from "./patchers";

/**
 * A global patch that applies to the main script
 * but also the worker script.
 * 
 * It introduces two functions that are used
 * server-side to tweak the data and origin
 * of `postMessage` calls.
 * - `__sfPreparePostMessageData` : Tweak the data ;
 * - `__sfPreparePostMessageOrigin` : Tweak the origin.
 * 
 * Also patches the `MessageEvent` and `ExtendableMessageEvent`
 * prototypes to use the tweaked data and origin.
 */
export const initializePostMessageOverride = ($window: typeof window): void => {
  // @ts-expect-error
  // Initialize the `__sfPreparePostMessageData` function.
  // Introduced server-side when tweaking JS code.
  $window["__sfPreparePostMessageData"] = function (data: NonNullable<unknown>): unknown {
    let output;

    if ("Window" in $window) {
      output = {
        __data: tweakPostMessageData(data),
        // @ts-ignore
        __origin: $window.__sfLocation.origin
      };
    }
    else {
      output = data;
    }

    return output;
  };

  // @ts-expect-error
  // Initialize the `__sfPreparePostMessageOrigin` function.
  // Introduced server-side when tweaking JS code.
  $window["__sfPreparePostMessageOrigin"] = function (origin: unknown) {
    if ("Window" in $window && ("string" == typeof origin || origin instanceof String)) {
      return "*";
    }
    else {
      return origin;
    }
  };

  function patchDataMethod (original_fn: () => unknown) {
    const data = original_fn();
    if (isDataPatched(data)) {
      return data["__data"];
    }
    else {
      return data;
    }
  }

  function patchOriginMethod (original_fn: () => unknown) {
    // @ts-ignore
    const evt = this as MessageEvent;

    // @ts-ignore
    let data = this["__sf_original_data"];
    if (isDataPatched(data)) {
      return data["__origin"];
    }
    // @ts-ignore
    else if (this.source && this.source.location) {
      // @ts-ignore
      data = this.source.location.href;
      data = SurfonxyURI.create(data, undefined, $window).patch();
      // before : return new URI(data).origin();
      return URI(data).origin();
    }
    // Check if the event comes from a WebSocket
    else if (
      // `.target` should be from WebSocket
      evt.target && evt.target.constructor.name === "WebSocket"
      // and `.currentTarget` should also be from WebSocket.
      && evt.currentTarget && evt.currentTarget.constructor.name === "WebSocket"  
      // Both should be the same on a WebSocket message event.
    ) {
      // This URL is already patched.
      // We'll get the origin from there.
      const proxied_url = (evt.target as WebSocket).url;
      const proxied_uri = new URL(proxied_url);
      return proxied_uri.origin;
    }
    else {
      return original_fn();
    }
  }

  if ("MessageEvent" in $window) {
    try {
      patchDescriptorInPrototype(
        $window,
        $window.MessageEvent.prototype,
        "data",
        patchDataMethod,
        function () {}
      );
    }
    catch (error) {
      console.error("postMessageOverride: Failed to patch `MessageEvent.prototype.data` property.", error);
    }

    try {
      patchDescriptorInPrototype(
        $window,
        $window.MessageEvent.prototype,
        "origin",
        patchOriginMethod,
        function () {}
      );
    }
    catch (error) {
      console.error("postMessageOverride: Failed to patch `MessageEvent.prototype.origin` property.", error);
    }
  }

  if ("ExtendableMessageEvent" in $window) {
    try {
      patchDescriptorInPrototype(
        $window,
        $window.ExtendableMessageEvent.prototype,
        "data",
        patchDataMethod,
        function () {}
      );
    }
    catch (error) {
      console.error("postMessageOverride: Failed to patch `ExtendableMessageEvent.prototype.data` property.", error);
    }

    try {
      patchDescriptorInPrototype(
        $window,
        $window.ExtendableMessageEvent.prototype,
        "origin",
        patchOriginMethod,
        function () {}
      );
    }
    catch (error) {
      console.error("postMessageOverride: Failed to patch `ExtendableMessageEvent.prototype.origin` property.", error);
    }
  }
};

/**
 * Helper to know if the data has
 * already been patched or no.
 */
const isDataPatched = (data: unknown): data is {
  __data: unknown,
  __origin: string
} => {
  if (!data) return false;

  return typeof data === "object"
    // Check properties (`data` is non-null, checked above)
    && "__data" in data
    && "__origin" in data;
};

const tweakPostMessageData = (data: NonNullable<unknown>) => {
  if (data) {
    if (isDataPatched(data)) {
      return data.__data;
    }
    else if (Array.isArray(data)) {
      for (let index = 0; index < data.length; index++) {
        if (isDataPatched(data[index])) {
          data[index] = data[index]["__data"];
        }
        else {
          tweakPostMessageData(data[index]);
        }
      }
    }
    else if (typeof data === "object") {
      for (const key in data) {
        // @ts-ignore
        if (isDataPatched(data[key])) {
          // @ts-ignore
          data[key] = data[key]["__data"];
        }
        else {
          // @ts-ignore
          tweakPostMessageData(data[key]);
        }
      }
    }
  }

  return data;
};