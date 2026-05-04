import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve('packages');
const files = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (full.endsWith('.ts') && !full.includes(`${join('packages', 'tests')}`)) files.push(full);
  }
}

walk(root);
for (const file of files) {
  await import(pathToFileURL(resolve(file)).href);
}

console.log(`Build import check passed for ${files.length} TypeScript modules.`);
