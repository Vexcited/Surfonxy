import { parse } from "meriyah";
import { traverse } from "estree-toolkit";
import { generate } from "astring";

// Constants.
const SCOPE_OPEN = ["(", "[", "{",];
const SCOPE_CLOSE = [")", "]", "}",];
const getFunctionParameters = (code: string, options: {
  start_index: number
}): {
  end_index: number,
  parameters: string[]
} => {
  let index = options.start_index;
  let current_char = code[index];

  // Initialize the count of open parentheses.
  let parenthesis_count = 1;

  // Initialize the index for parameters and an empty array to store them.
  let parameters_index = 0;
  const parameters = [""];

  while (parenthesis_count > 0) {
    if (SCOPE_OPEN.includes(current_char)) parenthesis_count++;
    else if (SCOPE_CLOSE.includes(current_char)) parenthesis_count--;
    // if we find a string, go to the end of it
    else if (current_char === "\"" || current_char === "'" || current_char === "`") {
      const string_start = current_char;
      let string_end = false;

      // Add the string beginning.
      parameters[parameters_index] += current_char;
      
      while (index < code.length) {
        current_char = code[++index];
        // Add the character.
        parameters[parameters_index] += current_char;
        
        if (current_char === string_start) {
          // Check that the character wasn't escaped.
          if (code[index - 1] !== "\\") {
            string_end = true;
            break;
          }
        }
      }

      if (!string_end) {
        throw new Error("String not closed");
      }

      // skip to next char because
      // current char is the string end character (so " or ' or `)
      current_char = code[++index];
      continue;
    }
    else if (current_char === "," && parenthesis_count === 1) {
      // Move to the next parameter and initialize an empty string for it.
      parameters_index++;
      parameters[parameters_index] = "";
      current_char = code[++index];
      continue;
    }

    // Add the current character to the current parameter.
    parameters[parameters_index] += current_char;

    // Move to the next character in the code.
    current_char = code[++index];
  }

  const end_index = index;
  
  return {
    end_index,
    parameters
  };
};

/** Takes every `postMessage*(`. */
const POST_MESSAGE_REGEX = /postMessage\s*\(/g;
/**
 * Rewrite every `postMessage` calls so we can
 * tweak the data and origin.
 * 
 * Examples :
 * - `postMessage(data)` -> `postMessage(__sfPreparePostMessageData(data))`
 * - `postMessage(data, origin)` -> `postMessage(__sfPreparePostMessageData(data), __sfPreparePostMessageOrigin(origin))`
 */
const patchEveryPostMessageCalls = (code: string): string => {
  let current_match: RegExpExecArray | null;
  
  // Take every occurrences of `postMessage(`...
  while ((current_match = POST_MESSAGE_REGEX.exec(code)) !== null) {
    const start_index = current_match.index + current_match[0].length;
    const { parameters, end_index } = getFunctionParameters(code, { start_index });

    // check if it's a property definition
    let check_ending_index = end_index;
    let current_char = code[check_ending_index];
    while (current_char === " " || current_char === "\n") {
      current_char = code[++check_ending_index];
    }
    if (current_char === "{") continue;
    
    parameters[0] = `__sfPreparePostMessageData(${parameters[0]})`;

    // Since the second parameter is optional...
    if (typeof parameters[1] === "string") {
      parameters[1] = `__sfPreparePostMessageOrigin(${parameters[1]})`;
    }

    // We replace and the tweaked `postMessage` in the current code.
    code = code.substring(0, start_index) + parameters.join(",") + code.substring(end_index);
  }
  
  return code;
};

/**
 * @param code Raw JavaScript code to tweak.
 * @returns Tweaked JavaScript code that should be used instead.
 */
export const tweakJS = (code: string, href: string): string => {
  // We patch every `postMessage` calls.
  code = patchEveryPostMessageCalls(code);

  try {
    const ast = parse(code, {
      module: true,
      next: true
    });
  
    traverse(ast, {
      /**
       * Patch every `import ... from "url"` so
       * the `url` becomes an absolute URL.
       * 
       * Example : `./index.js` -> `https://example.com/index.js`
       */
      ImportDeclaration (path) {
        if (!path.node) return;

        // NOTE: It should always be literal but I still check it in case (?)
        if (path.node.source.type === "Literal") {
          const import_from = path.node.source.value;

          if (typeof import_from === "string") {
            path.node.source.value = new URL(import_from, href).href;
          }
        }
      },

      /**
       * Patch every `import(url)` so it becomes
       * an absolute URL.
       */
      ImportExpression (path) {
        if (!path.node) return;

        path.node.source = { // `{object}.href`
          type: "MemberExpression",
          optional: false,

          object: { // `new URL`
            type: "NewExpression",
            callee: {
              type: "Identifier",
              name: "URL"
            },
            // `($0, href)`
            arguments: [
              path.node.source,
              // This is the `href` argument that we pass
              // to say where the import is from.
              { type: "Literal", value: href }
            ]
          },
          computed: false,
          property: {
            type: "Identifier",
            name: "href"
          }
        };
      }
    });

    code = generate(ast);
  }
  catch (error) {
    console.error("[tweakJS]:", error, href);
  }

  return code;
};
