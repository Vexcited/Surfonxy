import type { SurfonxyLocation } from "./location";
import OriginalURI from "urijs";

const OriginalURItoString = OriginalURI.prototype.toString;
OriginalURI.prototype.valueOf = OriginalURI.prototype.toString = function () {
  return OriginalURItoString.call(this).replace(/##$/, "#");
};

export const URI = function (url: string | OriginalURI, base_url?: string | OriginalURI | undefined) {
  let native_url;
  try {
    native_url = new URL(url as string);
  }
  catch { /** Anyway. */}

  if (url && native_url) {
    if (!native_url.protocol || native_url.protocol.match(/^(http|https)/i)) {
      url = (url as string).replace(/(^[a-z]*:?)\/{3,}/i, "$1//");
      
      if (url.match(/(%[^0-9a-f%])|(%$)/i)) {
        console.info("Invalid url " + url + " fixed.");
        url = encodeURI(url);
      }

      if (url.match(/#$/)) {
        url += "#";
      }
    }
  }
  
  return OriginalURI(url, base_url);
};

export const getDirectory = (url: string | null = null, $window: typeof window) => {
  let uri;

  if (url) {
    uri = URI(url);
    // @ts-expect-error
    uri.origin($window.window_origin);
    return uri.toString();
  }
  
  // @ts-expect-error
  uri = $window.window_origin + URI($window.location.href).directory();
  if (uri.slice(-1) === "/") {
    return uri;
  }

  return uri + "/";
};

export class SurfonxyURI {
  public static create (url: string | OriginalURI | null, shouldCreateUri = false, $window: typeof window): SurfonxyURI {
    return new SurfonxyURI(url, shouldCreateUri, $window);
  }

  public readonly url: string | null;
  public readonly uri: OriginalURI | null;
  private $window: typeof window;

  constructor (url: string | OriginalURI | null, shouldCreateUri = false, $window: typeof window) {
    this.$window = $window;
    this.uri = null;

    if (
      // when we don't want to create the URI,
      // but the URL is still defined
      !shouldCreateUri && url !== null
      // or when we want to and the url is defined
      || shouldCreateUri && url
    ) {
      // we make sure it's transformed into a string
      url += "";
      // before : this.uri = new URI(url);
      this.uri = URI(url);
    }

    this.url = url as string;
  }

  /** Check if the `uri` is using HTTP or HTTPS protocol or is defined. */
  public isCorrect (): boolean {
    return !(
      !this.uri ||
      (this.uri.protocol() &&
        "http" !== this.uri.protocol() &&
        "https" !== this.uri.protocol())
    );
  }

  /**
   * Should skip or no the URL patching.
   * 
   * @returns `true` when we should skip (or means patched).
   */
  public isURLPatched (checkIfEquals1 = false): boolean {
    // Can't process the URL, we skip.
    if (!this.uri) return true;
    
    /**
     * When we don't check if the `__sf_url` parameter equals `1`,
     * so when `checkIfEquals1 === false`, every URL that has the parameter
     * will be skipped.
     * 
     * When we check if the `__sf_url` parameter equals `1`,
     * so when `checkIfEquals1 === true`, every URL that has the parameter
     * will be skipped ONLY if the value is NOT `1`. \
     * This is because `1` is a special value, but that doesn't mean the URL
     * has been patched.
     */
    return (
      !this.isCorrect() || (
        this.uri.hasSearch("__sf_url") &&
        (!checkIfEquals1 || ("1" !== this.getSfURLParam() && checkIfEquals1))
      )
    );
  }

  /** Checks if the URL is a blob reference or no. */
  public isBlob (): boolean {
    return !(!this.url || !this.url.match(/^blob:/i));
  }

  /**
   * Get the value of the `__sf_url`
   * search parameter in URI.
   */
  public getSfURLParam (): string | null {
    if (!this.uri) return null;

    if (this.isCorrect()) {
      // Get the `__sf_url` search param.
      return this.uri.search(true)["__sf_url"];
    }

    return null;
  }

  /**
   * Patch the URL search parameters and give the result.
   */
  public patchSearchParams (additionalSearchParams: Record<string, string> = {}, base_url: string | URI | null = null) {
    if (this.isURLPatched()) {
      console.log("skipped", this.url);
      return this.url;
    }

    try {
      let cloned_uri = this.uri!.clone();
      
      // @ts-expect-error
      if (cloned_uri.origin() && URI(cloned_uri.origin()).equals(this.$window.window_origin)) {
        cloned_uri.origin("");
      }
      
      // @ts-ignore
      base_url = base_url || (this.$window.__sfLocation as SurfonxyLocation).strictPatchedURI();
      
      cloned_uri = base_url
        ? cloned_uri.absoluteTo(base_url)
        : cloned_uri;

      if (!(cloned_uri.protocol() && cloned_uri.hostname())) {
        throw new Error(
          "No origin for url " +
          this.url +
          ", possible result is " +
          cloned_uri
        );
      }
        
      const origin = btoa(cloned_uri.origin()).replace(/=+$/g, "");
      
      cloned_uri = this.addSearchParam(
        // @ts-expect-error
        cloned_uri.origin(this.$window.window_origin),
        "__sf_url",
        origin
      );

      for (const keyParam in additionalSearchParams) {
        const paramValue = additionalSearchParams[keyParam];
        cloned_uri = this.addSearchParam(
          cloned_uri,
          "sf:" + keyParam,
          paramValue
        );
      }

      return cloned_uri.toString();
    }
    catch (error) {
      console.error(this.url, error, {
        "base_url": (base_url || "-")
      });

      return this.url;
    }
  }

  /**
   * Patch the URL with the origin in search parameters
   * and return the result.
   */
  public patch (): string {
    const encoded_origin = this.getSfURLParam();

    // skip if there's no `__sf_url` parameter.
    // or if it's `=== 1` (special value).
    if (!encoded_origin || encoded_origin === "1") {
      return this.url!;
    }

    let decoded_origin: string;
    try {
      decoded_origin = atob(encoded_origin); 
    }
    // if we can't decode the origin skip the URL.
    catch (error) {
      console.error(error, "Wrong origin supplied," + this.url);
      return this.url!;
    }

    const uri = this.uri!.clone().removeSearch("__sf_url");
    for (const queryKey in uri.query(true)) {
      // remove internal only parameters
      // (starting by `sf:`)
      if (queryKey.match(new RegExp("^sf:", "i"))) {
        uri.removeSearch(queryKey);
      }
    }

    return uri.origin(decoded_origin).toString()
      // because of the bulk `tweakJS` function that does `location -> __sfLocation`
      .replace("__sfLocation", "location")
      .trim();
  }

  /**
   * Add a search parameter to the URI.
   */
  public addSearchParam (uri: URI, key: string, value: string): URI {
    key = `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    key = (uri.search() ? "&" : "?") + key;
    return uri.search(uri.search() + key);
  }
}