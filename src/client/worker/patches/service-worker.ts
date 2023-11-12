import { patchMethodInPrototype } from "../../utils/patchers";
import { SurfonxyURI } from "../../utils/url";

export const patchWindowClientNavigate = () => {
  try {
    patchMethodInPrototype(
      window.WindowClient.prototype,
      "navigate",
      function (original_fn, args) {
        return (
          (args[0] = SurfonxyURI.create(args[0] as string, undefined, window).patchSearchParams()),
          original_fn(args)
        );
      }
    );
  }
  catch (error) {
    console.error(error);
  }
};

export const patchClientsOpenWindow = () => {
  try {
    patchMethodInPrototype(
      window.Clients.prototype,
      "openWindow",
      function (original_fn, args) {
        args[0] = SurfonxyURI.create(args[0] as string, undefined, window).patchSearchParams();
        return original_fn(args);
      }
    );
  }
  catch (error) {
    console.error(error);
  }
};

export const patchSkipWaiting = () => {
  try {
    patchMethodInPrototype(window, "skipWaiting", function () {
      return Promise.resolve();
    });
  }
  catch (error) {
    console.error(error);
  }
};

export const patchClientsClaim = () => {
  try {
    patchMethodInPrototype(window.Clients.prototype, "claim", function () {
      return Promise.resolve();
    });
  }
  catch (error) {
    console.error(error);
  }
};

export const patchImportScripts = () => {
  try {
    patchMethodInPrototype(
      window,
      "importScripts",
      function (original_fn, args) {
        for (let index = 0; index < args.length; index++) {
          args[index] = SurfonxyURI.create(args[index] as string, undefined, window).patchSearchParams();
        }

        return original_fn(args);
      },
      true,
      true
    );
  }
  catch (error) {
    console.error(error);
  }
};