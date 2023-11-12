import { SurfonxyElement, isElement } from "./elements";
import { SurfonxyURI } from "./url";

export const patchMethodInPrototype = (
  prototype: NonNullable<unknown>,
  method_name: string,
  patch_function: (original_function: (args: unknown[]) => unknown, args: unknown[]) => unknown,
  /**
   * Will leave the original method in the
   * prototype as `__sf_original_{method_name}`
   */
  make_original_copy_in_prototype = true,
  should_bind = false,
  is_class = false
) => {
  if (
    "object" != typeof prototype &&
    "function" != typeof prototype
  ) {
    // throws an error.
    throw new Error(`sf_worker(patchers): No object to replace method "${method_name}"`);
  }

  // @ts-ignore
  const original_method = prototype[method_name] as unknown as () => unknown;
  
  if ("function" != typeof original_method) {
    throw new Error(`sf_worker(patchers): No method ${method_name} defined in object ${prototype.constructor.name}`);
  }

  if (make_original_copy_in_prototype) {
    let copied_method = function () {
      if (is_class)  {
        return new (original_method as FunctionConstructor)(...arguments);
      }
      
      // @ts-expect-error
      return original_method.apply(this, arguments);
    };

    if (should_bind) {
      copied_method = copied_method.bind(prototype);
    }

    // @ts-ignore
    prototype[`__sf_original_${method_name}`] = copied_method;
  }

  let patched_method = function () {
    return patch_function.call(
      // @ts-expect-error
      this,
      (args) => {
        if (is_class) {
          return new (original_method as FunctionConstructor)(...args as unknown as IArguments);
        }
        else {
          // @ts-expect-error
          return original_method.apply(this, args);
        }
      },
      Array.from(arguments)
    );
  };
  
  if (should_bind) {
    patched_method = patched_method.bind(prototype);
  }

  // We finally override the method with our patched one.
  // @ts-expect-error
  prototype[method_name] = patched_method;
};

export const patchDescriptorInPrototype = (
  $window: typeof window,
  prototype: NonNullable<unknown>,
  property: string,
  patched_getter: (original_function: () => unknown) => unknown,
  patched_setter: (original_function: (...args: unknown[]) => unknown, value: unknown) => unknown,
  make_original_copy_in_prototype = true,
  is_copy_configurable = false
) => {
  // when it's an array, check which
  // one of the prototypes given has the property.
  if (prototype instanceof Array) {
    const prototypes = prototype;
    prototype = {};

    for (const current_prototype of prototypes) {
      if (property in current_prototype) {
        prototype = current_prototype;
        break;
      }
    }
  }

  if (typeof prototype !== "object") {
    throw new Error("No object to replace property " + property);
  }

  if (!(property in prototype)) {
    throw new Error(
      "No property " +
        property +
        " defined in object " +
        prototype.constructor.name
    );
  }

  const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    
  if (!descriptor || !descriptor.configurable) {
    throw new Error(
      "No configurable descriptor for object " +
        prototype.constructor.name +
        ", property " +
        property
    );
  }

  const new_setter = (element: unknown, attr: string, value: string) => {
    // @ts-ignore
    element[attr] = value;
    
    if (isElement(element, $window)) {
      element.setAttribute(attr, value);
    }
    
    return this;
  };

  const copied_descriptor = descriptor;
  
  Object.defineProperty(
    prototype,
    property,
    {
      set: function (new_value) {
        new_setter(this, `__sf_originalValueOf_${property}`, new_value);

        patched_setter.call(
          this,
          // @ts-ignore
          (args) => {
            // @ts-ignore
            copied_descriptor.set.call(this, args);
          },
          // @ts-ignore
          new_value,
          // @ts-ignore
          "property"
        );
      },
      get: function () {
        return patched_getter.call(
          this,
          // @ts-ignore
          () => copied_descriptor.get.call(this),
          // @ts-ignore
          "property"
        );
      },

      configurable: true,
      enumerable: true
    }
  );

  if (make_original_copy_in_prototype) {
    Object.defineProperty(prototype, `__sf_original_${property}`,
      {
        set: function (args) {
          // @ts-ignore
          copied_descriptor.set.call(this, args);
        },
        get: function () {
          // @ts-ignore
          return copied_descriptor.get.call(this);
        },

        configurable: is_copy_configurable,
        enumerable: false
      }
    );
  }

  property = property.toLowerCase();
  
  if (
    "Element" in window
    && prototype instanceof window.Element
    && typeof prototype.getAttribute === "function"
  ) {
    const originalSetAttribute = prototype.setAttribute;
    const originalGetAttribute = prototype.getAttribute;

    prototype.setAttribute = function (attr, value) {
      const attr_lowercase = attr.toLowerCase();
      if (attr_lowercase === property) {
        new_setter(this, `__sf_originalValueOf_${property}`, value);
        patched_setter.call(
          this,
          // @ts-ignore
          (args) => {
            // @ts-ignore
            originalSetAttribute.call(this, property, args);
          },
          // @ts-ignore
          value,
          // @ts-ignore
          "attribute"
        );
      }
      else {
        if (make_original_copy_in_prototype && attr_lowercase === `__sf_original_${property}`) {
          attr = property;
        }

        originalSetAttribute.call(this, attr, value);
      }
    };

    // @ts-ignore
    prototype.getAttribute = function (attr) {
      const attr_lowercase = attr.toLowerCase();

      if (attr_lowercase === property) {
        return patched_getter.call(
          this,
          () => originalGetAttribute.call(this, property),
          // @ts-ignore
          "attribute"
        );
      }
      else {
        // if we call the original method...
        if (make_original_copy_in_prototype && attr_lowercase === `__sf_original_${property}`) {
          attr = property;
        }

        return originalGetAttribute.call(this, attr);
      }
    };
  }
};

export const rewriteGetterPrototypeForURL = (
  $window: typeof window,
  prototype: NonNullable<unknown>,
  method_name: string,
  noSetter = false,
  skipWhenPossible = false
) => {
  patchDescriptorInPrototype(
    $window,
    prototype,
    method_name,
    function (original_fn) {
      const uri = SurfonxyURI.create(original_fn() as string, undefined, $window);
      if (skipWhenPossible && !uri.isURLPatched(true)) {
        return "";
      }

      return uri.patch();
    },
    noSetter
      ? function () {}
      : function (original_fn, value) {
        // @ts-ignore
        original_fn(SurfonxyURI.create(value).patchSearchParams());
      }
  );
};

export const rewriteElementAttributeForURL = (
  $window: typeof window,
  proto: NonNullable<unknown>,
  method_name: string,
  noSetter = false,
  shouldCreateUri = false
) => {
  patchDescriptorInPrototype(
    $window,
    proto,
    method_name,
    // @ts-ignore
    function (getter, type) {
      if (type === "attribute") {
        // @ts-ignore
        const element = SurfonxyElement.create(this, $window);
        if (element.hasOriginalValueOfAttr(method_name)) {
          return element.getOriginalValueOfAttr(method_name);
        }
      }
      return SurfonxyURI.create(getter(), shouldCreateUri, $window).patch();
    },
    noSetter
      ? function () {}
      : function (setter, value) {
        setter(
          SurfonxyURI.create(value as string, shouldCreateUri, $window).patchSearchParams()
        );
      }
  );
};