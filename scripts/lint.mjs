import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["packages", "tests", "scripts"];
const forbidden = [/\bconsole\.debug\b/];
const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (["dist", "node_modules", "test-results", "playwright-report", ".vite"].includes(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    if (stat.isFile() && /\.(ts|tsx|js|mjs|css|md)$/.test(entry)) files.push(path);
  }
}

for (const root of roots) walk(root);

const failures = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (/\r/.test(text)) failures.push(`${file}: CRLF line endings are not used in this repo`);
  for (const rule of forbidden) {
    if (rule.test(text)) failures.push(`${file}: forbidden debug statement`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`lint ok (${files.length} files checked)`);
