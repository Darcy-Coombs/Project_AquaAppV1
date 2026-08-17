import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "packages", "web", "dist");
const fieldkitDir = join(root, "fieldkit");
const distIndexPath = join(distDir, "index.html");
const fieldkitIndexPath = join(fieldkitDir, "index.html");
const rootIndexPath = join(root, "index.html");

const html = await readFile(distIndexPath, "utf8");
const cssMatch = html.match(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/);
const jsMatch = html.match(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/);

if (!cssMatch || !jsMatch) {
  throw new Error("Could not find Vite CSS/JS asset tags in packages/web/dist/index.html");
}

const css = (await readFile(join(distDir, cssMatch[1]), "utf8")).replace(/<\/style/gi, "<\\/style");
const js = (await readFile(join(distDir, jsMatch[1]), "utf8")).replace(/<\/script/gi, "<\\/script");

const singleFile = html
  .replace(cssMatch[0], () => `<style>\n${css}\n</style>`)
  .replace(jsMatch[0], () => `<script type="module">\n${js}\n</script>`)
  .replace("</head>", `  <script>
      window.AQUA_FIELDKIT_DIRECT_OPEN = location.protocol === "file:";
    </script>
  </head>`);

await mkdir(fieldkitDir, { recursive: true });
await writeFile(fieldkitIndexPath, singleFile);
await writeFile(rootIndexPath, singleFile);
await copyFile(join(distDir, "manifest.webmanifest"), join(fieldkitDir, "manifest.webmanifest"));
await copyFile(join(distDir, "icon.svg"), join(fieldkitDir, "icon.svg"));
await copyFile(join(distDir, "sw.js"), join(fieldkitDir, "sw.js"));

console.log(`wrote ${fieldkitIndexPath}`);
console.log(`wrote ${rootIndexPath}`);
