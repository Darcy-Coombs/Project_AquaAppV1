import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function startWeb(args = process.argv.slice(2)) {
  const port = Number(args.includes('--port') ? args[args.indexOf('--port') + 1] : 5173);
  const root = join(process.cwd(), 'packages', 'web');

  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1).replaceAll('..', '');
    try {
      const content = readFileSync(join(root, file));
      res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html');
      res.end(content);
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  }).listen(port, () => console.log(`Project Aqua web UI listening on http://localhost:${port}`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  (globalThis as any).__aquaWebRuntime = startWeb();
}
