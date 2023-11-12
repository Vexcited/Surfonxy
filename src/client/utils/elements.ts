import { SurfonxyURI } from "./url";
import { initializeClient } from "../main/patches/init";

export const isElement = (value: unknown, $window: typeof window): value is Element => {
  return value instanceof $window.Element;
};

export const isInDocument = (node: Node, $window: typeof window) => {
  return isElement(node, $window) && $window.document.documentElement.contains(node);
};

export class SurfonxyElement {
  public static create (element: unknown, $window: typeof window) {
    return new this(element, $window);
  }

  public element: Element;
  private patches: Record<string, () => void>;
  private cutePatches: Record<string, () => void>;

  constructor (element: unknown, private $window: typeof window) {
    if (!isElement(element, this.$window)) {
      throw new TypeError("Wrong argument passed. Should be instance of Element");
    }

    this.element = element;

    this.patches = {
      a: () => {
        this.patchURLFrom("href");
      },
      area: () => {
        this.patchURLFrom("href");
      },
      form: () => {
        this.patchURLFrom("action");
      },
      video: () => {
        this.patchURLFrom("src", true);
      },
      audio: () => {
        this.patchURLFrom("src", true);
      },
      source: () => {
        this.patchURLFrom("src", true);
      },
      use: () => {
        this.patchURLFrom("href", true);
      },
      iframe: () => {
        const url = this.getOriginalAttr("src");
        const uri = SurfonxyURI.create(url, false, this.$window);
        const notPatched = !(!url || !uri.isCorrect()) && !uri.isURLPatched();

        const hasSandbox = this.element.hasAttribute("sandbox");
        if (notPatched) this.patchURLFrom("src", true);
        if (hasSandbox) this.element.removeAttribute("sandbox");

        if ((hasSandbox || notPatched) && this.element.parentNode) {
          this.element.parentNode.replaceChild(this.element, this.element);
        }
        
        if (uri["isBlob"]()) { // TODO: Support blob iframe
          console.warn("[SurfonxyElement][iframe]: We don't support blob iframe, yet.", uri);
        }

        const patchIFrame = () => {
          const element = this.element as HTMLIFrameElement;

          if (!("__surfonxied" in element.contentWindow!)) {
            initializeClient(
              element.contentWindow! as typeof this.$window,
              // @ts-ignore
              this.$window.window_hostname,
              // @ts-ignore
              this.$window.window_origin,
              // @ts-ignore
              this.$window.location.href
            );
            
            console.info("[SurfonxyElement][iframe]: Initialized.");
          }
        };
        
        const element = this.element as HTMLIFrameElement;
        if (element.contentWindow) {
          patchIFrame();
        }
        else {
          let timeout = 0;

          const interval = this.$window.setInterval(() => {
            // When the window is loaded, we can patch the iframe.
            if (element.contentWindow) patchIFrame();
            
            if (200 <= timeout || element.contentWindow) {
              this.$window.clearInterval(interval);
            }
            else timeout++;
          }, 10);
        }
      },
      base: () => {
        if (!this.hasAttr("__sfGenerated")) {
          const head = this.$window.document.head;
          const current_base = head.querySelector("base[__sfGenerated]");

          if (current_base) {
            head.removeChild(current_base);
          }
        }

        SurfonxyElement.create(this.$window.document.documentElement, this.$window).cutePatchRecursively();
      },
    };

    this.cutePatches = {
      a: () => {
        this.patchOriginalURLFrom("href");
      },
      area: () => {
        this.patchOriginalURLFrom("href");
      },
      form: () => {
        this.patchOriginalURLFrom("action");
      },
    };
  }

  /**
   * Gives the `tagName` of the element in lowercase. \
   * Returns `null` if the element doesn't have a `tagName`.
   */
  public lowerTagName (): string | null {
    return "tagName" in this.element && this.element.tagName
      ? this.element.tagName.toLowerCase()
      : null;
  }

  public hasAttr (attr: string) {
    return this.element.hasAttribute(attr);
  }

  public getAttr (attr: string) {
    return this.element.getAttribute(attr);
  }

  public setAttr (attr: string, value: string) {
    try {
      // @ts-ignore
      this.element[attr] = value;
    }
    catch (error) {
      console.error(error);
    }

    this.element.setAttribute(attr, value);
    return this;
  }

  public getOriginalAttr (attr: string) {
    return this.getAttr(`__sf_original_${attr}`);
  }

  public setOriginalAttr (attr: string, value: string) {
    return this.setAttr(`__sf_original_${attr}`, value);
  }

  public getOriginalValueOfAttr (attr: string) {
    return this.getAttr(`__sf_originalValueOf_${attr}`);
  }

  public setOriginalValueOfAttr (attr: string, value: string) {
    return this.setAttr(`__sf_originalValueOf_${attr}`, value);
  }

  public hasOriginalValueOfAttr (attr: string) {
    return this.hasAttr(`__sf_originalValueOf_${attr}`);
  }

  public isPatched (): string | null | undefined {
    // @ts-ignore
    return this.getAttr("__surfonxied") || this.element["__surfonxied"];
  }

  /** patch the element if not done already */
  public patch () {
    if (!this.isPatched()) {
      this.setAttr("__surfonxied", "1");

      const tagName = this.lowerTagName() as string;
      if (this.patches[tagName]) this.patches[tagName]();
    }

    return this;
  }

  public patchRecursively () {
    this.patch();

    if (this.element.children.length) {
      for (const child of this.element.children) {
        if (isElement(child, this.$window)) {
          SurfonxyElement.create(child, this.$window).patchRecursively();
        } 
      }
    }

    return this;
  }

  public cutePatch () {
    const tagName = this.lowerTagName() as string;
    if (this.cutePatches[tagName]) this.cutePatches[tagName]();
    
    return this;
  }

  public cutePatchRecursively () {
    this.cutePatch();

    if (this.element.children.length) {
      for (const child of this.element.children) {
        if (isElement(child, this.$window)) {
          SurfonxyElement.create(child, this.$window).cutePatchRecursively();
        } 
      }
    }

    return this;
  }

  public patchURLFrom (attr: string, shouldCreateUri = false) {
    const value = this.getOriginalAttr(attr);
    const uri = SurfonxyURI.create(value, shouldCreateUri, this.$window);
    
    if (!uri.isURLPatched()) {
      this.setOriginalAttr(attr, uri.patchSearchParams() as string);
      this.setOriginalValueOfAttr(attr, value as string);
    }

    return this;
  }

  /**
   * patch url in originalValueOf
   * to put in original attr
   */
  public patchOriginalURLFrom (attr: string) {
    if (this.hasOriginalValueOfAttr(attr)) {
      const url = this.getOriginalValueOfAttr(attr) as string;
      this.setOriginalAttr(attr, SurfonxyURI.create(url, undefined, this.$window).patchSearchParams() as string);
    }

    return this;
  }
}