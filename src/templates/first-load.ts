import * as esbuild from "esbuild";
import url from "node:url";

const first_load_script_path = url.fileURLToPath(new URL("../client/first-load.ts", import.meta.url).href);
const first_load_script_result = await esbuild.build({
  entryPoints: [first_load_script_path],
  bundle: true,
  minify: true,
  write: false,
  format: "esm"
});

const first_load_script = first_load_script_result.outputFiles[0].text;

export const getFirstLoadDocument = (): string => `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your proxy is initializing...</title>
    </head>
    <body>
      <h1>Wait, we're initializing the service-worker for you !</h1>
      
      <p>
        You'll be automatically redirected to the proxied page when the worker has been activated.
        It enables us to intercept all the requests and to proxy them to the real server.
        If you want to learn more about how it works, you can see our <a href="https://github.com/Vexcited/surfonxy" target="_blank">GitHub repository</a>.
      </p>
      
      <p>
        <!-- The content of the span is the actual first status message. -->
        STATE : <span id="status">Initializing the first-load script...</span>
      </p>
      
      <script type="module">${first_load_script}</script>
    </body>
  </html>
`.trim();
