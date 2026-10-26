import { copyFile, mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const root = dirname(require.resolve("stockfish/package.json"));
const { version } = require("stockfish/package.json") as { version: string };
const destination = new URL("../public/stockfish/", import.meta.url);
await mkdir(destination, { recursive: true });
// Remove previously generated builds so development cannot serve an old engine.
for (const file of await readdir(destination)) {
  if (/^stockfish-.*\.(js|wasm)$/.test(file))
    await unlink(new URL(file, destination));
}
for (const file of ["stockfish-19.js", "stockfish-19.wasm"]) {
  await copyFile(join(root, "bin", file), new URL(file, destination));
}
await copyFile(join(root, "Copying.txt"), new URL("COPYING.txt", destination));
await writeFile(
  new URL("SOURCE.txt", destination),
  `Stockfish.js ${version}, full multithreaded build, unmodified.\nSource and build instructions: https://github.com/nmrugg/stockfish.js/tree/v${version}\nPackage: https://www.npmjs.com/package/stockfish/v/${version}\nLicense: GPL-3.0; see COPYING.txt.\n`,
);
console.log(`Prepared Stockfish.js ${version} (full multithreaded)`);
