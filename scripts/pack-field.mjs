import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');
const src = join(root, 'packages', 'field-web');
const out = join(root, 'dist', 'aqua-field-kit');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(src, out, { recursive: true, filter: (path) => !path.endsWith('dev-server.ts') });
writeFileSync(join(out, 'FIELD-KIT.txt'), `Aqua Field Kit

Open index.html on a phone, or serve this folder over HTTPS for installable PWA behaviour.

For network sync, set Node URL in the app to a reachable Aqua node, for example:
https://your-node.example.com

For nearby testing without a reachable node, export a bundle file on one phone and import it on another.
`);

console.log(`Aqua field kit written to ${out}`);
