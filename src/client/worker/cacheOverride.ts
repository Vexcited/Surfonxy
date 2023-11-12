/// <reference lib="WebWorker" />

import { patchMethodInPrototype } from "../utils/patchers";
import { SurfonxyURI } from "../utils/url";

export const initializeCacheOverride = (): void => {
  if ("Cache" in window) {
    // Sweet execution order.
    overrideCacheAdd();
    overrideCacheAddAll();
    overrideCacheDelete();
    overrideCacheKeys();
    overrideCacheMatch();
    overrideCacheMatchAll();
    overrideCachePut();

    // Inform that the cache proxy methods are now attached.
    console.info("[cacheOverride]: Cache proxy methods attached !");
  }
};

/**
 * Override the `Cache.prototype.add` method.
 */
const overrideCacheAdd = (): void => {
  try {
    patchMethodInPrototype(Cache.prototype, "add",
      (original_fn, args) => {
        args[0] = SurfonxyURI.create(args[0] as string, undefined, window).patchSearchParams();
        return original_fn(args);
      },

      true, true
    );
  }
  catch (error) {
    console.error("[cacheOverride]: Failed to patch `Cache.prototype.add` method.", error);
  }
};

/**
 * Override the `Cache.prototype.addAll` method.
 */
const overrideCacheAddAll = (): void => {
  try {
    patchMethodInPrototype(Cache.prototype, "addAll",
      (original_fn, args) => {
        for (let index = 0; index < args.length; index++) {
          args[index] = SurfonxyURI.create(args[index] as string, undefined, window).patchSearchParams();
        }

        return original_fn(args);
      },

      true, true
    );
  }
  catch (error) {
    console.error("[cacheOverride]: Failed to patch `Cache.prototype.addAll` method.", error);
  }
};

/**
 * Override the `Cache.prototype.delete` method.
 */
const overrideCacheDelete = (): void => {
  try {
    patchMethodInPrototype(Cache.prototype, "delete",
      (original_fn, args) => {
        args[0] = SurfonxyURI.create(args[0] as string, undefined, window).patchSearchParams();
        return original_fn(args);
      }
    );
  }
  catch (error) {
    console.error("[cacheOverride]: Failed to patch `Cache.prototype.delete` method.", error);
  }
};

/**
 * Override the `Cache.prototype.keys` method.
 * NOTE: Nothing to do here, we're just patching it in case we need it later.
 */
const overrideCacheKeys = (): void => {
  try {
    patchMethodInPrototype(Cache.prototype, "keys",
      (original_fn, args) => original_fn(args)
    );
  }
  catch (error) {
    console.error("[cacheOverride]: Failed to patch `Cache.prototype.keys` method.", error);
  }
};

/**
 * Override the `Cache.prototype.match` method.
 */
const overrideCacheMatch = (): void => {
  try {
    patchMethodInPrototype(Cache.prototype, "match",
      (original_fn, args) => {
        args[0] = SurfonxyURI.create(args[0] as string, undefined, window).patchSearchParams();
        return original_fn(args);
      }
    );
  }
  catch (error) {
    console.error("[cacheOverride]: Failed to patch `Cache.prototype.match` method.", error);
  }
};

/**
 * Override the `Cache.prototype.matchAll` method.
 */
const overrideCacheMatchAll = (): void => {
  try {
    patchMethodInPrototype(Cache.prototype, "matchAll",
      (original_fn, args) => {
        for (let index = 0; index < args.length; index++) {
          args[index] = SurfonxyURI.create(args[index] as string, undefined, window).patchSearchParams();
        }

        return original_fn(args);
      }
    );
  }
  catch (error) {
    console.error("[cacheOverride]: Failed to patch `Cache.prototype.matchAll` method.", error);
  }
};

/**
 * Override the `Cache.prototype.put` method.
 */
const overrideCachePut = (): void => {
  try {
    patchMethodInPrototype(Cache.prototype, "put",
      (original_fn, args) => {
        args[0] = SurfonxyURI.create(args[0] as string, undefined, window).patchSearchParams();
        return original_fn(args);
      }
    );
  }
  catch (error) {
    console.error("[cacheOverride]: Failed to patch `Cache.prototype.put` method.", error);
  }
};