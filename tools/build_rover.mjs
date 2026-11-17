/** Build the isolated React island. The existing pages remain buildless HTML. */
import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = path.join(root, "assets");
const exists = async (file) => {
  try {
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
};
const model = await exists(path.join(assetRoot, "models/rover.glb"));
await fs.mkdir(path.join(assetRoot, "models"), { recursive: true });
await fs.writeFile(
  path.join(assetRoot, "models/rover-assets.json"),
  JSON.stringify(
    { model: model ? "/models/rover.glb" : null },
    null,
    2,
  ) + "\n",
);
const early = await build({
  absWorkingDir: root, entryPoints: ["product/rover/prepaint.js"], bundle: true,
  format: "iife", target: ["es2022"], minify: true, write: false,
});
await fs.mkdir(path.join(root, "assets/product-3d"), { recursive: true });
await fs.writeFile(path.join(root, "assets/product-3d/prepaint.js"), early.outputFiles[0].text);
let previousOutputs = [];
try {
  previousOutputs = JSON.parse(
    await fs.readFile(path.join(root, "assets/product-3d/build-report.json"), "utf8"),
  );
} catch {}
const result = await build({
  absWorkingDir: root,
  entryPoints: { bootstrap: "product/rover/bootstrap.js" },
  outdir: "assets/product-3d",
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  jsx: "automatic",
  minify: true,
  metafile: true,
  entryNames: "[name]",
  chunkNames: "[name]-[hash]",
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "linked",
});
const outputs = [];
for (const [file, meta] of Object.entries(result.metafile.outputs)) {
  const bytes = await fs.readFile(path.join(root, file));
  outputs.push({
    file,
    bytes: meta.bytes,
    gzipBytes: gzipSync(bytes).length,
    entry: meta.entryPoint ?? null,
  });
}
await fs.writeFile(
  path.join(root, "assets/product-3d/build-report.json"),
  JSON.stringify(outputs, null, 2) + "\n",
);
for (const old of previousOutputs) {
  if (!outputs.some((item) => item.file === old.file) && old.file.startsWith("assets/product-3d/"))
    await fs.unlink(path.join(root, old.file)).catch(() => {});
}
console.log(
  "Built lazy Product 3D island:",
  outputs
    .filter((item) => item.entry)
    .map((item) => `${path.basename(item.file)} ${item.bytes} bytes (${item.gzipBytes} gzip)`)
    .join("; "),
);
