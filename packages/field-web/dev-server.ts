import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function startFieldWeb(args = process.argv.slice(2)) {
  const port = Number(args.includes('--port') ? args[args.indexOf('--port') + 1] : 5180);
  const root = join(process.cwd(), 'packages', 'field-web');

  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1).replaceAll('..', '');
    try {
      const content = readFileSync(join(root, file));
      res.setHeader('Content-Type', contentType(file));
      res.end(content);
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  }).listen(port, () => console.log(`Aqua Field listening on http://localhost:${port}`));
}

function contentType(file: string) {
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.js')) return 'text/javascript';
  if (file.endsWith('.json') || file.endsWith('.webmanifest')) return 'application/json';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  return 'text/html';
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  (globalThis as any).__aquaFieldWebRuntime = startFieldWeb();
}
