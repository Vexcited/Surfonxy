/// <reference lib="DOM" />
/// <reference lib="dom.iterable" />
export {};

const statusElement = document.getElementById("status") as HTMLSpanElement;
const writeInStatus = (html: string, color = "black") => {
  statusElement.innerHTML = html;
  statusElement.style.color = color;
};

/// Checks if the browser supports all the features required by the proxy.
const unsupported: string[] = [];

/** Tests the browser support of ES6. */
const es6Support = (function () {
  "use strict";

  if (typeof Symbol === "undefined") {
    return false;
  }

  try {
    window.eval("class A {}");
    window.eval("const f = (x) => x ** 2");
  }
  catch {
    return false;
  }

  return true;
})();

const addEventListenerSupport = !!document.addEventListener;

const querySelectorAllSupport = !!document.querySelectorAll;
const serviceWorkerSupport = !!navigator.serviceWorker;
  
if (!es6Support) {
  unsupported.push("ES6");
}

if (!addEventListenerSupport) {
  unsupported.push("document.addEventListener");
}

if (!querySelectorAllSupport) {
  unsupported.push("document.querySelectorAll");
}

if (!serviceWorkerSupport) {
  unsupported.push("navigator.serviceWorker");
}
  
if (unsupported.length > 0) {
  writeInStatus(`Your browser doesn't support the following features : ${unsupported.join(", ")}. Aborting.`, "red");
}
else {
  const redirectToProxy = () => {
    const redirection_url = new URL(window.location.href);
    redirection_url.searchParams.delete("__sf_register");
    writeInStatus(`Done! You'll be redirected. If you're not, click <a href="${redirection_url.href}">here</a>.`, "green");

    window.location.href = redirection_url.href;
  };
  
  // Clear everything
  writeInStatus("Clearing localStorage...", "black");
  window.localStorage && window.localStorage.clear();
  writeInStatus("Clearing sessionStorage...", "black");
  window.sessionStorage && window.sessionStorage.clear();
  
  // If there's any indexedDB, delete it.
  if (window.indexedDB && window.indexedDB.databases) {
    const databases = (await window.indexedDB.databases()) || [];
    if (databases.length > 0) {
      writeInStatus(`Clearing indexedDB... (0/${databases.length})`, "black");
    
      for (let database_index = 0; database_index < databases.length; database_index++) {
        writeInStatus(`Clearing indexedDB... (${database_index + 1}/${databases.length})`, "black");
        window.indexedDB.deleteDatabase(databases[database_index].name!);
      }
    }
  }

  writeInStatus("Building service-worker URL...", "black");
  const service_worker_url = new URL("/__sf.sw.js", window.location.origin);
  service_worker_url.searchParams.set("__sf_url", "1");
  service_worker_url.searchParams.set("dummy", crypto.randomUUID());
  
  writeInStatus("Registering service-worker...", "black");
  const registration = await window.navigator.serviceWorker.register(
    service_worker_url.href,
    { scope: window.location.origin + "/" }
  );

  const sw = registration.installing || registration.waiting;

  // It's already activated, redirect.
  if (!sw) redirectToProxy();
  else {
    writeInStatus("Waiting service-worker to register...", "black");
    // Whenever it gets activated, redirect to the proxy.
    sw.onstatechange = () => {
      "activated" === sw.state && redirectToProxy();
    };
  }
}
