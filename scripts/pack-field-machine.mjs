import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');
const out = join(root, 'dist', 'aqua-trusted-field-machine');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const file of ['package.json', 'package-lock.json', 'README.md', 'Start Aqua Field.bat', 'Start Aqua Tester.bat']) {
  cpSync(join(root, file), join(out, file));
}

for (const dir of ['docs', 'scripts', 'packages']) {
  cpSync(join(root, dir), join(out, dir), { recursive: true });
}

writeFileSync(join(out, 'START-HERE.txt'), `Aqua Trusted Field Machine

Requirements:
- Node.js 24 or newer

Start the node and phone-ready field app:

1. Double-click Start Aqua Field.bat
2. Open http://localhost:5180 on this computer
3. For phones, use this computer's LAN IP or an HTTPS tunnel
4. In each phone's Sync tab, set the node URL to the reachable node

The trusted field app verifies imported events before storing them:
- canonical event hash
- Ed25519 signature
- protocol/module/type schema
- known parents
- no negative spend/escrow paths
- verified-user checks for governance and chat
`);

console.log(`Aqua trusted field machine written to ${out}`);
