import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');
const src = join(root, 'packages', 'field-web');
const out = join(root, 'dist', 'aqua-field-kit');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(src, out, { recursive: true, filter: (path) => !path.endsWith('dev-server.ts') });
writeFileSync(join(out, 'start.html'), standaloneHtml());
writeFileSync(join(out, 'FIELD-KIT.txt'), `Aqua Field Kit

For the simplest phone test, open start.html.
It is a single-file version for phones that block local JavaScript modules.

For installable PWA behaviour, serve this folder over HTTPS and open index.html.

For network sync, set Node URL in the app to a reachable Aqua node, for example:
https://your-node.example.com

For nearby testing without a reachable node, export a bundle file on one phone and import it on another.
`);

console.log(`Aqua field kit written to ${out}`);

function standaloneHtml() {
  const style = readFileSync(join(src, 'style.css'), 'utf8');
  const script = [
    readModule(join(src, 'protocol', 'events.js')),
    readModule(join(src, 'protocol', 'state.js')),
    readModule(join(src, 'protocol', 'validator.js')),
    readModule(join(src, 'app.js')).replace(/if \('serviceWorker' in navigator\) \{[\s\S]*?render\(\);/, 'render();')
  ].join('\n\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#08786f" />
    <title>Aqua Field</title>
    <style>
${style}
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script>
${script}
    </script>
  </body>
</html>
`;
}

function readModule(path) {
  return readFileSync(path, 'utf8')
    .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*/g, '')
    .replace(/export\s+(const|let|var|async function|function|class)\s+/g, '$1 ');
}
