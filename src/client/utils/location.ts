import { SurfonxyElement } from "./elements";
import { SurfonxyURI, URI } from "./url";

export class SurfonxyWorkerLocation {
  public static create ($window: typeof window) {
    return new this($window);
  }

  constructor (protected $window: typeof window) {}

  get hash() {
    return this.$window.location.hash;
  }
  get host() {
    return this.patchedURI().host();
  }
  get hostname() {
    return this.patchedURI().hostname();
  }
  get href() {
    return this.currentProxiedURL();
  }
  get pathname() {
    return this.$window.location.pathname;
  }
  get port() {
    return this.patchedURI().port();
  }
  get protocol() {
    return this.patchedURI().protocol() + ":";
  }
  get search() {
    return this.patchedURI().search();
  }
  get origin() {
    return this.patchedURI().origin();
  }

  // Same as `.href`
  public toString() {
    return this.currentProxiedURL();
  }

  /**
   * Gives the patched URL (as `string`) of the current location.
   */
  public currentProxiedURL (checkUrlParams = false): string {
    const uri = SurfonxyURI.create(this.$window.location.href, undefined, this.$window);

    // if we don't check the URL params,
    // go patch the URL directly,
    // otherwise we check if we should skip or no.
    // reminder: here, skip only `if __sf_url !== "1"`
    if (!checkUrlParams || uri.isURLPatched(true)) {
      return uri.patch();
    }
    
    return this.$window.location.href;
  }

  /** Gives the patched URI of the current location. */
  public patchedURI (checkUrlParams = false): URI {
    return URI(this.currentProxiedURL(checkUrlParams));
  }
  
  /**
   * Gives the patched URI of the current location
   * **that also checks if the `__sf_url` param is NOT set to 1**.
   */
  public strictPatchedURI (): URI {
    return this.patchedURI(true);
  }
}

// @ts-ignore
export class SurfonxyLocation extends SurfonxyWorkerLocation {
  public static create (proxyUrl: string, passiveMode = false, $window: typeof window) {
    return new this(proxyUrl, passiveMode, $window);
  }

  public proxyUrl: string;
  public passiveMode: boolean;

  constructor(proxyUrl: string, passiveMode = false, $window: typeof window) {
    super($window);

    this.proxyUrl = proxyUrl;
    this.passiveMode = passiveMode;
    
    this.$window.addEventListener("hashchange", () => {
      this.refreshBaseElement();
    }, true);

    this.$window.addEventListener("popstate", () => {
      this.refreshBaseElement();
    }, true);
  }

  get hash() {
    return super.hash;
  }
  set hash(new_hash: string) {
    this.$window.location.hash = new_hash;
  }

  get host() {
    return super.host;
  }
  set host(new_host: string) {
    this.assign(this.patchedURI().host(new_host));
  }

  get hostname() {
    return super.hostname;
  }
  set hostname(new_hostname: string) {
    this.assign(this.patchedURI().hostname(new_hostname));
  }

  get href() {
    return super.href;
  }
  set href(new_href: string) {
    this.assign(new_href);
  }

  get pathname() {
    return super.pathname;
  }
  set pathname(new_pathname: string) {
    this.$window.location.pathname = new_pathname;
  }

  get port () {
    return super.port;
  }
  set port (new_port: string) {
    this.assign(this.patchedURI().port(new_port));
  }

  get protocol () {
    return super.protocol;
  }
  set protocol (new_protocol: string) {
    this.assign(this.patchedURI().protocol(new_protocol.replace(/:$/g, "")));
  }

  get search () {
    return super.search;
  }
  set search (new_search: string) {
    this.assign(this.patchedURI().search(new_search));
  }

  get username () {
    return this.patchedURI().username();
  }
  set username (new_username: string) {}

  get password () {
    return this.patchedURI().password();
  }
  set password (new_password: string) {}

  public assign (href: string | URI): void {
    this.$window.location.assign(
      this.passiveMode
        ? href + "" // cast to string
        : SurfonxyURI.create(href, undefined, this.$window).patchSearchParams() as string
    );
  }

  public reload (forceReload: boolean): void {
    // @ts-expect-error
    this.$window.location.reload(forceReload);
  }

  public replace (href: string): void {
    this.$window.location.replace(
      this.passiveMode
        ? href + "" // cast to string
        : SurfonxyURI.create(href, undefined, this.$window).patchSearchParams() as string
    );
  }

  public strictPatchedURI (): URI {
    const base = this.$window.document.querySelector("base");
    if (base) {
      const base_url = SurfonxyElement.create(base, this.$window).getOriginalAttr("href");
      if (base_url) {
        return URI(base_url).absoluteTo(this.patchedURI());
      }
    }

    let proxiedUrl = this.currentProxiedURL();
    if (!SurfonxyURI.create(proxiedUrl, undefined, this.$window).isCorrect() && this.proxyUrl) {
      proxiedUrl = SurfonxyURI.create(this.proxyUrl,undefined, this.$window).patch();
    }
    
    return URI(proxiedUrl);
  }

  /** Refresh main `<base>` element in DOM. */
  public refreshBaseElement (): SurfonxyLocation {
    const base = this.$window.document.querySelector("base[__sfGenerated]");
    if (base) {
      base.setAttribute("href", this.currentProxiedURL());
    }

    this.noop(); // No-op function.
    return this;
  }

  /** No-op function. */
  private noop () {}
}