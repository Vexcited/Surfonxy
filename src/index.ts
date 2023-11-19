import type { IncomingMessage, ServerResponse } from "node:http";
import https from "node:https";
import fs from "node:fs";
import { isUtf8 } from "node:buffer";

import * as esbuild from "esbuild";
import url from "node:url";

// @ts-ignore
import WebSocket from "faye-websocket";
// @ts-ignore
import deflate from "permessage-deflate";

import { SurfonxyCookie } from "./cookie";
import TCookie from "tough-cookie";

import { getFirstLoadDocument } from "./templates/first-load";
import { tweakHTML } from "./tweaks/html";
import { tweakJS } from "./tweaks/javascript";

const main_script_result = await esbuild.build({
  entryPoints: [
    url.fileURLToPath(new URL("./client/main.ts", import.meta.url).href)
  ],
  bundle: true,
  minify: false, //true,
  write: false,
  format: "iife"
});

const worker_script_result = await esbuild.build({
  entryPoints: [
    url.fileURLToPath(new URL("./client/worker.ts", import.meta.url).href)
  ],
  bundle: true,
  minify: false, //true,
  write: false,
  format: "iife"
});

const main_script = main_script_result.outputFiles[0].text;
const worker_script = worker_script_result.outputFiles[0].text;

const getHeaderValue = (headers: Record<string, string>, key: string): string | null => {
  const header_key = Object.keys(headers).find((header_key) => header_key.toLowerCase() === key.toLowerCase());
  if (!header_key) return null;

  return headers[header_key];
};

const deleteHeaderValue = (headers: Record<string, string>, key: string): void => {
  const header_key = Object.keys(headers).find((header_key) => header_key.toLowerCase() === key.toLowerCase());
  if (!header_key) return;

  delete headers[header_key];
};

const setHeaderValue = (headers: Record<string, string>, key: string, value: string): void => {
  // We delete the header if it already exists.
  if (getHeaderValue(headers, key) !== null) {
    deleteHeaderValue(headers, key);
  }

  headers[key] = value;
};

const getBody = (message: IncomingMessage) => {
  return new Promise<Buffer>((resolve) => {
    const bodyParts: Uint8Array[] = [];

    message
      .on("data", (chunk: Uint8Array) => {
        bodyParts.push(chunk);
      })
      .on("end", () => {
        const body = Buffer.concat(bodyParts);
        resolve(body);
      });
  });
};

const cookies_store = new TCookie.CookieJar();

const handleProxy = async (res: ServerResponse<IncomingMessage> & {
  req: IncomingMessage;
}, request_proxy_url: URL) => {
  // When getting from the search params it could be `string | null`.
  // `string` because we get the base64 encoded value of the origin.
  let request_url: string | URL | null = request_proxy_url.searchParams.get("__sf_url");
  if (!request_url) {
    console.error("[req][no_origin]", request_proxy_url.href);

    res.writeHead(400);
    return res.end("No ORIGIN provided in the \"__sf_url\" search parameter.");
  }

  try {
    // We build the URL from the base64 encoded value.
    request_url = new URL(
      request_proxy_url.pathname + request_proxy_url.search + request_proxy_url.hash,
      // We decode the base64 value to get the origin.
      Buffer.from(request_url as string, "base64")
        .toString("utf8")
        // it can be in the origin as well
        .replace(/__sfLocation/g, "location")
    );

    request_url.searchParams.delete("__sf_url");
    request_url.searchParams.delete("__sf_register");

    // in case it's infected in the pathname
    request_url.pathname = request_url.pathname.replace(/__sfLocation/g, "location");

    // debug: we log every requests made in the proxy and
    //        the real value for easier debugging.
    // console.info("[req]", request_url.href, "<->", request_proxy_url.href);
  }
  catch (error) {
    // TODO: Add a better error handling, with custom Error class.
    throw new Error(
      "The provided URL is either...\n\t- Not an origin ;\n\t- Not a base64 encoded value.\n...or both, maybe."
    );
  }

  const request_headers: Record<string, string> = {};
  // Retrieve request headers from raw headers.
  for (let index = 0; index < res.req.rawHeaders.length; index += 2) {
    const key = res.req.rawHeaders[index];
    const value = res.req.rawHeaders[index + 1];
    request_headers[key] = value;
  }

  const cookiesAsObject: Record<string, string> = {};

  const getter_proxier = new SurfonxyCookie(
    cookies_store.getCookieStringSync(request_proxy_url.href),
    request_url.hostname,
    request_proxy_url.hostname
  );

  const server_user_cookies = getter_proxier.proxyGetter();
  for (const cookie of server_user_cookies.split("; ")) {
    if (!cookie) continue;
    const [key, value] = cookie.split("=");
    cookiesAsObject[key] = value;
  }

  const client_user_cookies = (getHeaderValue(request_headers, "x-sf-cookie") || "")
    .split(";")
    .map(cookieString => TCookie.parse(cookieString));
  for (const cookie of client_user_cookies) {
    if (!cookie) {
      continue;
    } // sus
    cookiesAsObject[cookie.key] = cookie.value;
  }
  
  // we concatenate both cookies
  const sent_cookies = [];

  for (const key in cookiesAsObject) {
    if (Object.prototype.hasOwnProperty.call(cookiesAsObject, key)) {
      const value = cookiesAsObject[key];
      sent_cookies.push(key + "=" + value);
    }
  }

  // Proxy the cookies to have only the ones for the current domain.
  if (sent_cookies.length > 0) {
    setHeaderValue(request_headers, "Cookie", sent_cookies.join("; "));
  }
  else deleteHeaderValue(request_headers, "Cookie");

  // We make sure that the host is the same as the one we're proxying.
  // NOTE: We delete the header because `fetch` will automatically add it.
  deleteHeaderValue(request_headers, "host");

  // Automatically sets it.
  deleteHeaderValue(request_headers, "content-length");

  // NOTE: idk what im doing for this delete tbh
  // deleteHeaderValue(request_headers, "transfer-encoding");
  // NOTE: Bun doesn't support that header completely (node:zlib missing some classes)
  // deleteHeaderValue(request_headers, "accept-encoding");

  // Proxy origin header only if exists.
  if (getHeaderValue(request_headers, "origin") !== null) {
    setHeaderValue(request_headers, "origin", request_url.origin);
  }

  // Proxy referer header only if exists.
  const refererValue = getHeaderValue(request_headers, "referer");
  if (refererValue) {
    try {
      const refererURL = new URL(refererValue);
      // We decode the base64 value to get the origin.
      const encoded_proxied_origin = refererURL.searchParams.get("__sf_url");
      let proxied_origin = request_url.origin;

      if (encoded_proxied_origin) {
        proxied_origin = Buffer.from(encoded_proxied_origin, "base64").toString("utf8");
      }
      refererURL.searchParams.delete("__sf_url");
      refererURL.searchParams.delete("__sf_register"); // in case
      
      const newRefererValue = new URL(
        refererURL.pathname + refererURL.search + refererURL.hash,
        proxied_origin
      ).href;

      // console.info("[req][referer]", refererValue, "->", newRefererValue);
      setHeaderValue(request_headers, "referer", newRefererValue);
    }
    catch {
      deleteHeaderValue(request_headers, "referer");
      console.warn("[req][referer] deleting header since not parsable ::", refererValue);
    }
  }

  // We get the body of our request.
  let body = await getBody(res.req);
  if (isUtf8(body)) {
    const fixed_body = new TextDecoder("utf8", { fatal: true }).decode(body);
    body = Buffer.from(fixed_body.replace(/__sfLocation/g, "location"), "utf-8");
  }

  // set the length of the body.
  // setHeaderValue(request_headers, "content-length", Buffer.byteLength(body).toString());

  // Make this as a function to be able to
  // call when there's an error (ETIMEDOUT)
  const makeRequestToRealServer = async (): Promise<Response | undefined> => {
    try {
      const response = await fetch(decodeURIComponent((request_url as URL).href), {
        method: res.req.method,
        headers: request_headers,
        body: (res.req.method !== "HEAD" && res.req.method !== "GET") ? body : void 0,
        redirect: "manual"
      });

      return response;
    }
    catch (e) {
      const error = e as Error & { code: string };
      // TODO: find the error code, this is currently wrong.
      if (error.code === "ETIMEDOUT") {
        console.warn("[req][timeout]", (request_url as URL).href);
        return;
        // return makeRequestToRealServer();
      }

      console.error(`[crash][${(request_url as URL).href}]`, error);
    }
  };

  const response = await makeRequestToRealServer();
  if (!response) {
    res.writeHead(500);
    return res.end("An error happened, check console.");
  }

  // console.info("[res]", request_url, request_headers, body);
  const response_headers: string[] = [];

  for (const pair of response.headers.entries()) {
    const key = pair[0];
    const value = pair[1];

    // Don't forget to proxy the set-cookies.
    if (key === "set-cookie") {
      const proxier = new SurfonxyCookie(
        value,
        (request_url as URL).hostname,
        request_proxy_url.hostname
      );

      // rewrite a part of the `proxySetter`
      const cookiesObj = proxier.setterAsObject(proxier.cookieString);

      if (cookiesObj !== null) {
        const cookieDomain = "domain" in cookiesObj
          // cookies can be named like .example.com, so we remove the dot
          ? (cookiesObj.domain as string).replace(/^\./, "")
          // if there's no domain set, it's the current proxied hostname.
          : proxier.proxiedHostname; // -> 
        
        if (proxier.checkDomain(cookieDomain)) {
          cookiesObj.name = cookiesObj.name + "@" + cookieDomain;
          cookiesObj.domain = proxier.localHostname;
          // set the path by default to "/"
          cookiesObj.path = "path" in cookiesObj ? cookiesObj.path : "/";
          cookiesObj.secure = true;
        
          const cookie_setter = SurfonxyCookie.objectAsSetter(cookiesObj);
          if (cookie_setter) {
            cookies_store.setCookieSync(cookie_setter, request_proxy_url.href);
            response_headers.push(key, cookie_setter);
          }
        }
      }
    }
    else if (
      ![ // The key is not included in those headers.
        "x-frame-options",
        "content-security-policy",
        "cross-origin-resource-policy",
        "cross-origin-embedder-policy",
        "content-security-policy-report-only",
        "cross-origin-opener-policy",
        "permissions-policy",
        "x-xss-protection",
        "report-to",

        "content-encoding",
        "content-length",
        "cookie",
        "transfer-encoding"
      ].includes(key)
    ) {
      // We keep the items as they are.
      response_headers.push(key, value);
    }
  }
  // When there's a redirection
  if (response.status >= 300 && response.status < 400) {
    const locationHeaderIndex = response_headers.findIndex((header) => header.toLowerCase() === "location");
    
    if (locationHeaderIndex !== -1) {
      const redirect_to = response_headers[locationHeaderIndex + 1];

      let old_location: URL;
      try {
        old_location = new URL(redirect_to);
      }
      // If there's an error, it's 99% relative.
      // NOTE: Yes 1% remains, it's what I don't know, yet.
      catch {
        old_location = new URL(
          redirect_to,
          // We pass in the original URL
          // in case the redirection is relative.
          (request_url as URL).href
        );
      }

      const new_redirection_url = new URL(
        old_location.pathname + old_location.search + old_location.hash,
        request_proxy_url.origin
      );
      
      // We add the origin to the redirection URL.
      new_redirection_url.searchParams.set("__sf_url", Buffer.from(old_location.origin).toString("base64"));
      
      // After the redirection, we assume the service worker has
      // already been set up.
      new_redirection_url.searchParams.delete("__sf_register");
      
      // console.log("[req][redirect]", `${old_location.href} (${redirect_to}) -> ${new_redirection_url.href}`);
      response_headers[locationHeaderIndex + 1] = new_redirection_url.href;
      res.writeHead(response.status, response_headers);
      return res.end();
    }
  }

  const contentTypeHeaderIndex = response_headers.findIndex((header) => header.toLowerCase() === "content-type");
  if (contentTypeHeaderIndex !== -1) {
    const contentType = response_headers[contentTypeHeaderIndex + 1];

    if (contentType.startsWith("text/html")) {
      let content = await response.text();
      if ( // it's not an HTML document
        !content.toLowerCase().includes("<body")
          && !content.toLowerCase().includes("<head")  
          && !content.toLowerCase().includes("<html")  
      ) {
        content = content.replace(/location/g, "__sfLocation");
        res.writeHead(response.status, response_headers);
        return res.end(content);
      }

      content = await tweakHTML(
        content,
        request_proxy_url,
        (request_url as URL)
      );

      content = content.replace(/location/g, "__sfLocation");
      res.writeHead(response.status || 200, response_headers);
      return res.end(content);
    }
    // Also tweak JavaScript files.
    // According to <https://www.rfc-editor.org/rfc/rfc4329.txt>, JavaScript files
    // can have two media types, which are `application/javascript`
    // and `text/javascript` - but this one should be obsolete.
    else if (contentType?.match(/(application|text)\/javascript/)) {
      let content = await response.text();
      content = tweakJS(content, (request_url as URL).href);
      content = content.replace(/location/g, "__sfLocation");

      if (request_proxy_url.searchParams.get("sf:parser:sw") === "1") {
        const worker_url = new URL(`/__sf.sw.js?dummy=${crypto.randomUUID()}`, request_proxy_url.origin);
        content = `
importScripts("${worker_url.href}");

try {
  ${content}
} catch (e) {
  console.warn("sf_worker(server): An error happened", e);
}
        `.trim();
      }

      res.writeHead(200, response_headers);
      return res.end(content);
    }
  }


  const responseBuffer = await response.arrayBuffer();
  if (isUtf8(responseBuffer)) {
    let content = new TextDecoder("utf8", { fatal: true }).decode(responseBuffer);
    content = content.replace(/location/g, "__sfLocation");
    
    res.writeHead(response.status, response_headers);
    return res.end(content);
  }

  res.writeHead(response.status, response_headers);
  return res.end(Buffer.from(responseBuffer));
};

const server = https.createServer({
  key: fs.readFileSync(new URL("../surfonxy.dev-key.pem", import.meta.url)),
  cert: fs.readFileSync(new URL("../surfonxy.dev.pem", import.meta.url))
}, async (req, res) => {
  try {
    const host = req.headers.host;
    // @ts-expect-error
    const protocol = req.socket.encrypted ? "https" : "http";
    const request_proxy_url = new URL(req.url || "/", `${protocol}://${host}`);
  
    if (request_proxy_url.pathname === "/__sf.sw.js") {
      res.writeHead(200, {
        "Content-Type": "application/javascript",
        "Server": "surfonxy@0.0.0-rc.1"
      });
  
      return res.end(worker_script);
    }
    else if (request_proxy_url.pathname === "/__sf.main.js") {
      res.writeHead(200, {
        "Content-Type": "application/javascript",
        "Server": "surfonxy@0.0.0-rc.1"
      });
    
      return res.end(main_script);
    }
  
    const needSW = request_proxy_url.searchParams.get("__sf_register") === "1";
    if (needSW) {
      const document = getFirstLoadDocument();
      // installing service-worker page before showing the actual page
      res.writeHead(200, [
        "Content-Type", "text/html",
        "Server", "surfonxy@0.0.0-rc.1"
      ]);
  
      return res.end(document);
    }
  
    const out = await handleProxy(res, request_proxy_url);
    return out;
  }
  catch (e) {
    console.error(`[crashed][${req.url}]`, e);

    res.writeHead(500);
    return res.end("An error happened, check console.");
  }
});

// manually handle the upgrade request
server.on("upgrade", function (request, socket, head) {
  if (!WebSocket.isWebSocket(request)) return;

  const host = request.headers.host;
  // @ts-expect-error
  const protocol = socket.encrypted ? "https" : "http";
  const request_proxy_url = new URL(request.url || "/", `${protocol}://${host}`);
  
  // only accept for our proxy
  if (request_proxy_url.pathname !== "/__sfw__") {
    socket.end();
    return;
  }

  // only accept when there's the URL (?u) AND the ORIGIN (&o).
  const encoded_proxied_url = request_proxy_url.searchParams.get("u");
  // the origin of the page (not from the proxied url)
  const encoded_proxied_origin = request_proxy_url.searchParams.get("o");
  if (!encoded_proxied_origin || !encoded_proxied_url) {
    socket.end();
    return;
  }

  // decode
  let proxied_url: string;
  let proxied_origin: string;
  try {
    proxied_url = Buffer.from(encoded_proxied_url, "base64").toString("utf-8");
    proxied_origin = Buffer.from(encoded_proxied_origin, "base64").toString("utf-8");
  }
  catch (e) {
    socket.end();
    return;
  }

  const protocols: string[] = request.headers["sec-websocket-protocol"]?.split(", ") || [];
  const extensions: string[] = request.headers["sec-websocket-extensions"]?.split("; ") || [];

  const request_headers: Record<string, string> = {};
  // Retrieve request headers from raw headers.
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const key = request.rawHeaders[index];
    const value = request.rawHeaders[index + 1];
    request_headers[key] = value;
  }

  const raw_user_cookies = getHeaderValue(request_headers, "cookie") || "";
  const user_cookies = new SurfonxyCookie(
    raw_user_cookies,
    new URL(proxied_url).hostname,
    request_proxy_url.hostname
  );

  const sent_cookies = user_cookies.proxyGetter();
  const proxied_headers: Record<string, string> = {
    Origin: proxied_origin,
    "User-Agent": getHeaderValue(request_headers, "user-agent")!
  };

  if (sent_cookies) proxied_headers["Cookie"] = sent_cookies;

  const proxied_websocket = new WebSocket.Client(proxied_url, protocols, {
    headers: proxied_headers,
    extensions: extensions.includes("permessage-deflate") ? [deflate] : []
  });

  let ws: WebSocket.Client;
  proxied_websocket.onopen = () => {
    ws = new WebSocket(request, socket, head, protocols, {
      extensions: extensions.includes("permessage-deflate") ? [deflate] : []
    });

    ws.on("message", (event: { data: string }) => {
      proxied_websocket.send(event.data);
    });
  
    ws.on("close", (event: { code?: number, reason?: string }) => {
      let code = event.code;
  
      // TODO: Fork the library to support this.
      // `1001` fails here for example because the library just doesn't support it.
      // See <https://www.iana.org/assignments/websocket/websocket.xml#close-code-number-rules>
      if (event.code && event.code !== 1000 && event.code > 1000 && event.code < 2000) {
        code = 1000;
      }
  
      proxied_websocket.close(code, event.reason);
    });
  };

  proxied_websocket.onmessage = (event: { data: string }) => {
    ws.send(event.data);
  };

});

server.listen(443, "0.0.0.0");