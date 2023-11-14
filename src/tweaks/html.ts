import * as cheerio from "cheerio";

// import fs from "node:fs/promises";
// import { tweakJS } from "~/proxy/tweaks/javascript";
import { tweakJS } from "./javascript";
import { JAVASCRIPT_MIMES } from "../constants";

export const tweakHTML = async (
  content: string,
  request_url: URL,
  proxied_url: URL
): Promise<string> => {
  const $ = cheerio.load(content);

  /**
   * Re-implementation of `simpleRewriteURL` from `~/client/utils/rewrite.ts`
   * for server-side.
   */
  const simpleRewriteURL = (original_url: URL | string): URL => {
    // when the URL is a string...
    if (typeof original_url === "string") {
      // if the URL passes, it was something like...
      // `https://example.com/...`
      try {
        original_url = new URL(original_url);
      }
      // the url is a relative OR absolute path so something like...
      // `/path/file` or `./path/file`, ...
      catch {
        // so we assign the origin to the URL.
        // so it becomes `https://example.com/path/file`.
        original_url = new URL(original_url, proxied_url.href);
      }
    }
  
    let patched_url = new URL(original_url);
    if (patched_url.origin !== request_url.origin) {
      patched_url.searchParams.set("__sf_url", btoa(patched_url.origin));
  
      // we rebuild the url with the base origin.
      patched_url = new URL(
        patched_url.pathname + patched_url.search + patched_url.hash,
        request_url.origin
      );
    }
  
    return patched_url;
  };

  // Rewrite every `<a>` elements.
  $("a[href]").each(function () {
    const current_href = $(this).attr("href");
    if (!current_href) return;

    $(this).attr("href", simpleRewriteURL(current_href).href);
  });

  // We travel through every inline scripts, and tweak them.
  $("script")
    .not("[src]")
    .each(function () {
      const type = $(this).attr("type");
      // When there's no type, we assume it's a JavaScript script.
      // Otherwise, we check if the type is a JavaScript MIME.
      if (type && !JAVASCRIPT_MIMES.includes(type.toLowerCase())) return;

      const new_script_content = tweakJS($(this).html() as string, proxied_url.href);
      $(this).html(new_script_content);
    });

  // We travel through every scripts and we remove the integrity attribute.
  $("script[integrity]").each(function () {
    $(this).removeAttr("integrity");
  });

  // Remove every `meta[http-equiv="Content-Security-Policy"]` from DOM.
  $("meta[http-equiv=\"Content-Security-Policy\"]").each(function () {
    $(this).remove();
  });

  const pl = new URL(request_url.href);
  pl.searchParams.set("__sf_url", btoa(proxied_url.origin));

  $("head").prepend(`<script src="${request_url.origin}/__sf.main.js?__sf_url=1&dummy=${crypto.randomUUID()}" __surfonxied="1" type="text/javascript"></script>`);

  const permalink = new URL(request_url);
  permalink.searchParams.set("__sf_register", "1");

  // Add our client script at the beginning of the `head` of the document.
  $("head").prepend(`
<script __surfonxied="1">
  window.__sf_permalink = new URL('${permalink.href}');
  window.__sf_serviceWorkerUrl = '${request_url.origin}/__sf.sw.js?__sf_url=1&dummy=${crypto.randomUUID()}';
</script>
  `.trim());

  const current_base = $("head base");
  if (current_base.length === 0) {
    // Add generated `<base>`, <https://developer.mozilla.org/docs/Web/HTML/Element/base>.
    // Will be removed by client script if another `<base>`
    // already exists somehow.
    $("head").prepend(`<base __sfGenerated="1" href="${proxied_url.href}" />`);
  }
  // When there's already a `<base>` element, we cutely patch it.
  else {
    const current_base_href = current_base.attr("href");
    // NOTE: We don't check if `current_base_href` is `undefined` or not.
    const new_base_href = new URL(
      current_base_href!,
      proxied_url.href
    );
  
    // Patch the `href` attribute.
    current_base.attr("href", new_base_href.href);
  }

  return $.html();
};