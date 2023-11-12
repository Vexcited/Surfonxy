import { SurfonxyElement } from "../../utils/elements";
import { patchDescriptorInPrototype, patchMethodInPrototype, rewriteElementAttributeForURL } from "../../utils/patchers";
import { URI } from "../../utils/url";

export const overrideFormActions = ($window: typeof window) => {
  const patchedFormAction = (formEl: HTMLFormElement) => {
    let uri: string | null | SurfonxyElement = SurfonxyElement.create(formEl, $window).patch();

    if (formEl.method.toLowerCase() === "get") {
      uri = uri.hasAttr("action") ? uri.getOriginalAttr("action") : $window.location.href;

      if ("string" != typeof uri) {
        throw new Error("Form action is incorrect");
      } 

      // @ts-ignore
      uri = URI(uri as string).query(true);
      
      const existent_input = formEl.querySelector(
        "input[name=\"__sf_url\"]"
      );

      // @ts-ignore
      if (("__sf_url" in uri) && !existent_input) {
        const input_origin = $window.document.createElement("input");
        input_origin.setAttribute("type", "hidden");
        input_origin.setAttribute("name", "__sf_url");
        // @ts-ignore
        input_origin.setAttribute("value", uri["__sf_url"]);
        formEl.appendChild(input_origin);
      }
    }
  };

  try {
    rewriteElementAttributeForURL(
      $window,
      $window.HTMLFormElement.prototype,
      "action"
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchMethodInPrototype(
      $window.HTMLFormElement.prototype,
      "submit",
      function (original_fn, args) {
        // @ts-ignore
        patchedFormAction(this);
        return original_fn(args);
      }
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchMethodInPrototype(
      $window.HTMLInputElement.prototype,
      "click",
      function (original_fn, args) {
        // @ts-ignore
        "submit" === this.type && this.form && patchedFormAction(this.form);
        return original_fn(args);
      }
    );
  }
  catch (error) {
    console.error(error);
  }

  $window.addEventListener(
    "submit",
    function (evt) {
      evt.target && patchedFormAction(evt.target as HTMLFormElement);
    },
    true
  );
};

export const overrideElementPrototype = (prototype: HTMLElement, $window: typeof window) => {
  try {
    patchMethodInPrototype(prototype, "click", function (original_fn, args) {
      // @ts-ignore
      SurfonxyElement.create(this, $window).patch();
      return original_fn(args);
    });
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchMethodInPrototype(prototype, "toString", function () {
      // @ts-ignore
      return this.href;
    });
  }
  catch (error) {
    console.error(error);
  }

  try {
    rewriteElementAttributeForURL($window, prototype, "href");
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchDescriptorInPrototype(
      $window,
      prototype,
      "protocol",
      function () {
        // @ts-ignore
        const protocol = URI(this.href).protocol();
        return protocol && protocol + ":";
      },
      function (setter, value) {
        // @ts-ignore
        this.href = URI(this.href)
          .protocol((value as string).replace(/:$/g, ""))
          .toString();
      }
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchDescriptorInPrototype(
      $window,
      prototype,
      "host",
      function () {
        // @ts-ignore
        return URI(this.href).host();
      },
      function (setter, value) {
        // @ts-ignore
        this.href = URI(this.href)
          .host(value as string)
          .toString();
      }
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchDescriptorInPrototype(
      $window,
      prototype,
      "hostname",
      function () {
        // @ts-ignore
        return URI(this.href).hostname();
      },
      function (setter, value) {
        // @ts-ignore
        this.href = URI(this.href)
          .hostname(value as string)
          .toString();
      }
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchDescriptorInPrototype(
      $window,
      prototype,
      "port",
      function () {
        // @ts-ignore
        return URI(this.href).port();
      },
      function (setter, value) {
        // @ts-ignore
        this.href = URI(this.href)
          .port(value as string)
          .toString();
      }
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchDescriptorInPrototype(
      $window,
      prototype,
      "search",
      function () {
        // @ts-ignore
        return URI(this.href).search();
      },
      function (setter, value) {
        // @ts-ignore
        this.href = URI(this.href)
          .search(value as string)
          .toString();
      }
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchDescriptorInPrototype(
      $window,
      prototype,
      "username",
      function () {
        // @ts-ignore
        return URI(this.href).username();
      },
      function (setter, value) {
        // @ts-ignore
        this.href = URI(this.href)
          .username(value as string)
          .toString();
      }
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchDescriptorInPrototype(
      $window,
      prototype,
      "password",
      function () {
        // @ts-ignore
        return URI(this.href).password();
      },
      function (setter, value) {
        // @ts-ignore
        this.href = URI(this.href)
          .password(value as string)
          .toString();
      }
    );
  }
  catch (error) {
    console.error(error);
  }

  try {
    patchDescriptorInPrototype(
      $window,
      prototype,
      "origin",
      function () {
        // @ts-ignore
        return URI(this.href).origin();
      },
      function () {}
    );
  }
  catch (error) {
    console.error(error);
  }
};

export const overrideMetaElement = ($window: typeof window) => {
  const prototype = $window.HTMLMetaElement.prototype;

  const isContentSecurityPolicy = (element: HTMLMetaElement): boolean => {
    if (element.hasAttribute("http-equiv")) {
      const http_equiv = element.getAttribute("http-equiv");
      
      if (http_equiv?.toLowerCase() === "content-security-policy") {
        return true;
      }
    }

    return false;
  };

  try {
    patchDescriptorInPrototype($window,
      prototype, "content",
      function (getter) {
        // @ts-ignore
        const element = this as HTMLMetaElement;

        // Return `undefined` when we try to get the content
        // of a Content Security Policy meta tag.
        if (isContentSecurityPolicy(element)) return;

        return getter();
      },
      function (setter, value) {
        // @ts-ignore
        const element = this as HTMLMetaElement;

        // Don't set the content of a
        // Content Security Policy meta tag.
        if (isContentSecurityPolicy(element)) return;

        return setter(value);
      }
    );
  }
  catch (error) {
    console.error(error);  
  }
};
