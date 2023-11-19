/// This file is used in both, client-side and server-side.
/// Try to prevent using any browser-specific 
/// or (Bun|Node.js)-specific features.

export class SurfonxyCookie {
  public static create (
    cookieString: string,
    proxiedHostname: string,
    localHostname: string
  ): SurfonxyCookie {
    return new this(cookieString, proxiedHostname, localHostname);
  }

  constructor (
    /**
     * The cookie to parse, can be a setter or a getter (see below).
     * 
     * - Setter : `test1=Hello; SameSite=None; Domain=.youtube.com; Path=/`
     * - Getter : `test1=Hello; test2=World`
     */
    public cookieString: string,

    /**
     * - Equals to `proxiedLocation.hostname` client-side.
     * - Equals to `request_url.hostname` server-side.
     */
    public proxiedHostname: string,

    /**
     * - Equals to `window.location.hostname` client-side.
     * - Equals to `request_proxy_url.hostname` server-side.
     */
    public localHostname: string
  ) {}

  /**
   * To use whenever we receive a setter cookie string. \
   * Example : `test1=Hello; SameSite=None; Domain=${~proxiedHostname}; Path=/`
   * 
   * We'll proxy that string to add our local domain correctly. \
   * Example : `test1@${proxiedHostname}=Hello; SameSite=None; Domain=${localHostname}; Path=/`
   */
  public proxySetter (): string | null {
    // build the object from str
    const cookiesObj = this.setterAsObject(this.cookieString);

    if (cookiesObj !== null && !this.isInternalCookie(cookiesObj.name)) {
      const cookieDomain = "domain" in cookiesObj
        // cookies can be named like .example.com, so we remove the dot
        ? (cookiesObj.domain as string).replace(/^\./, "")
        // if there's no domain set, it's the current proxied hostname.
        : this.proxiedHostname; // -> 
      
      if (this.checkDomain(cookieDomain)) {
        cookiesObj.name = cookiesObj.name + "@" + cookieDomain;
        cookiesObj.domain = this.localHostname;
        // set the path by default to "/"
        cookiesObj.path = "path" in cookiesObj ? cookiesObj.path : "/";
        cookiesObj.secure = true;
      
        return SurfonxyCookie.objectAsSetter(cookiesObj);
      }
    }

    return null;
  }

  public Vt () {
    const setterObj = this.setterAsObject(this.cookieString);

    return null !== setterObj && this.isInternalCookie(setterObj.name)
      ? SurfonxyCookie.qt(setterObj)
      : null;
  }

  /**
   * Only returns the cookies for the current domain as a string.
   * 
   * - Value is `document.cookie` for client-side.
   * - Value is `request.headers.cookie` for server-side.
   * 
   * @returns `COOKIE1=value1; COOKIE2=value2`
   */
  public proxyGetter (): string {
    const output_cookies: string[] = [];

    for (const cookie of SurfonxyCookie.parse(this.cookieString, false)) {
      let cookieName: string | string[] = cookie.name;
      const cookieValue = cookie.value;
      cookieName = SurfonxyCookie.split("@", cookieName);
      if (1 in cookieName) {
        const realCookieName = cookieName[0];
        cookieName = cookieName[1];
        
        if (this.checkDomain(cookieName)) {
          output_cookies.push(realCookieName + "=" + cookieValue);
        }

      }
    }
    return output_cookies.join("; ");
  }

  /**
   * Get every internal proxy cookies.
   * 
   * An internal proxy cookie is a cookie that is set by the proxy
   * and used ONLY for the proxy to work.
   * 
   * For Surfonxy, they all start with `__sf`.
   * 
   * @returns `__sfCOOKIE1=value1; __sfCOOKIE2=value2`
   */
  public getInternalCookies (): string {
    const output_cookies: string[] = [];

    for (const cookie of SurfonxyCookie.parse(this.cookieString, false)) {
      const cookieName = cookie.name;
      const cookieValue = cookie.value;

      // check if the cookie name is for a proxy internal cookie or not.
      if (this.isInternalCookie(cookieName)) {
        output_cookies.push(cookieName + "=" + cookieValue);
      }
    }

    return output_cookies.join("; ");
  }

  private INTERNAL_COOKIE_MATCH = new RegExp("^__sf", "i");

  /** Whether a cookie is a proxy internal cookie or not. */
  private isInternalCookie (cookieName: string): boolean {
    const match = cookieName.match(this.INTERNAL_COOKIE_MATCH);
    
    // Return it as boolean.
    return Boolean(match);
  }

  /** Whether the given `domain` is matching the current `proxiedHostname` or not. */
  public checkDomain (domain: string): boolean {
    return !!this.proxiedHostname.match(
      new RegExp(this.escapeDomainName(domain), "i")
    );
  }

  /** Helper to make the given domain easier to match. */
  private escapeDomainName (domain: string): string {
    return domain.replace(
      // eslint-disable-next-line no-useless-escape
      /[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g,
      "\\$&"
    );
  }

  /**
   * Get a set-cookie string as an object.
   * Makes it easier to update the cookie.
   * 
   * Example : `test1=Hello; SameSite=None; Domain=.youtube.com; Path=/`
   * will give : `{ name: 'test1', value: 'Hello', samesite: 'None', domain: '.youtube.com', path: '/' }`
   */
  public setterAsObject (cookieString: string): {
    name: string;
    value: string | null | boolean;
    [key: string]: string | null | boolean;
  } | null {
    if (!cookieString) return null;

    const obj = {} as {
      name: string;
      value: string | null | boolean;
      [key: string]: string | null | boolean;
    };

    const cookies = cookieString.split(";");
    
    for (let index = 0; index < cookies.length; index++) {
      const cookie = SurfonxyCookie.split("=", cookies[index]);
      cookie[0] = cookie[0].trim();

      // First index is always the `name=value` of the cookie.
      if (index === 0) {
        obj.name = cookie[0];
        
        // if there's only the name
        if (!(1 in cookie)) {
          obj.value = null;
        }
        // if there's also the value...
        else {
          obj.value = cookie[1];
        }
      }
      // Everything else is the cookie's attributes.
      else {
        // Casing for attributes is not important.
        obj[cookie[0].toLowerCase()] = !(1 in cookie) || cookie[1];
      }
    }

    return obj;
  }

  /**
   * Get the cookies as an object or an array if `asObject = false`.
   * 
   * when object mode (`true`): `{ key: value }` \
   * when array mode (`false`): `[ { name: key, value: value } ]`
   */
  private static parse <IsObject extends boolean>(cookieString: string, asObject: IsObject) {
    const output = new (asObject ? Object : Array)() as IsObject extends true ? Record<string, string> : Array<{ name: string, value: string }>;
    const cookies = cookieString.split(";");
    
    for (let index = 0; index < cookies.length; index++) {
      const cookie = SurfonxyCookie.split("=", cookies[index]);
      // if it has a key-value pair
      if (1 in cookie) {
        if (asObject) {
          // { key: value }
          (output as Record<string, string>)[cookie[0].trim()] = cookie[1];
        }
        else {
          // [ { name: key, value: value } ]
          (output as Array<{ name: string, value: string }>).push({
            name: cookie[0].trim(),
            value: cookie[1]
          });
        }
      }
    }

    return output;
  }

  /**
   * takes a cookie set object and transforms it
   * into a single string that can be used in a cookie set.
   */
  public static objectAsSetter (cookieSetObj: { [key: string]: string | boolean | null; name: string; value: string | boolean | null; }): string | null {
    const output_cookies: string[] = [];

    // if there's no name in the cookie, return null
    if (!("name" in cookieSetObj && cookieSetObj.name)) {
      return null;
    }

    // the first item should be the name=value of the cookie
    // (always the first in string)
    output_cookies.push(cookieSetObj.name + "=" + cookieSetObj.value);
    // remove them from object to prevent
    // them from being in the `for loop` below
    // @ts-expect-error
    delete cookieSetObj.name;
    // @ts-expect-error
    delete cookieSetObj.value;

    for (const key in cookieSetObj) {
      const value = cookieSetObj[key];

      // if the value is `true`, then
      // simply add the key to the output
      if (value === true) {
        output_cookies.push(key);
      }
      else if (value !== false) {
        output_cookies.push(key + "=" + value);
      }
    }

    return output_cookies.join(";");
  }

  private static qt (setterObj: {
    name: string;
    value: string | null | boolean;
    [key: string]: string | null | boolean;
  }) {
    const output_cookies: string[] = [];
    if (!("name" in setterObj && setterObj.name)) {
      return null;
    }

    output_cookies.push(setterObj.name + "=" + setterObj.value);
    // @ts-expect-error
    delete setterObj.name;
    // @ts-expect-error
    delete setterObj.value;

    for (const key in setterObj) {
      const value = setterObj[key];
      true === value
        ? output_cookies.push(key)
        : false !== value &&
          output_cookies.push(key + "=" + value);
    }

    return output_cookies.join(";");
  }

  /**
   * takes a separator and a value.
   * breaks into : [key, value] if separator is found.
   * otherwise, returns [value].
   */
  private static split (sep: string, val: string): string[] {
    const sep_index = val.indexOf(sep);
    
    if (0 <= sep_index) {
      return [
        val.slice(0, sep_index),
        val.slice(sep_index + 1)
      ];
    }
    else {
      return [val];
    }
  }
}
