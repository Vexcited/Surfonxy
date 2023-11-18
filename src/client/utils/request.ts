import type URI from "urijs";
import { SurfonxyURI } from "./url";

/**
 * Takes a request and deeply patch it
 * into a whole new request instance,
 * and finally returns it (in a Promise).
 */
export const rewriteRequest = async ($window: typeof window, original_request: Request, base_url: URI | null = null): Promise<Request> => {
  const request_body = await original_request.clone().text();
  let patched_referrer = "";
  let patched_url: string = original_request.url;

  try {
    patched_url = SurfonxyURI.create(patched_url, undefined, $window).patchSearchParams({}, base_url) as string;
  }
  catch (error) {
    // @ts-ignore
    console.error(error.message + " (url)");
  }

  try {
    if (original_request.referrer) {
      const referrer_uri = SurfonxyURI.create(original_request.referrer, undefined, $window);
          
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

  const patched_request = new Request(patched_url, {
    method: original_request.method,
    headers: new Headers(original_request.headers),
    mode: "cors",
    credentials: "omit", // remove cookies
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

  if ("document" in $window) {
    if ("cookie" in $window.document) {
      patched_request.headers.set("X-SF-Cookie", $window.document.cookie);
    }
  }
      
  return patched_request;
};