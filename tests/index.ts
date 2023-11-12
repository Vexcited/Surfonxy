import url from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";

const public_folder = url.fileURLToPath(new URL("./public", import.meta.url));

const tests = new Elysia();
tests.get("/", async () => {
  const file = await fs.readFile(path.join(public_folder, "index.html"), { encoding: "utf8" });
  return new Response(file, {
    status: 200,
    headers: { "Content-Type": "text/html" }
  });
});

tests.use(staticPlugin({
  assets: public_folder,
  prefix: "/"  
}));

tests.listen(8000, (server) => {
  console.info(`[tests]: Running on http://localhost:${server.port}`);
});