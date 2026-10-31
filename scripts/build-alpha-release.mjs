import { cp, mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

if(process.platform!=='win32' || process.arch!=='x64') throw new Error('This package targets Windows x64. Build it using Windows x64 Node 24.');
if(Number(process.versions.node.split('.')[0])!==24) throw new Error('Node 24 required');
const root=process.cwd(), version='1.1.0-alpha.1';
const output=join(root,'output','releases'), name=`Project-Aqua-${version}-win-x64`, folder=join(output,name);
await mkdir(folder,{recursive:true});
await mkdir(join(folder,'runtime'),{recursive:true});
await mkdir(join(folder,'data'),{recursive:true});
if((await readdir(join(folder,'data'))).length)throw new Error('Refusing to package an existing user ledger: use a fresh output folder');
await copyFile(process.execPath,join(folder,'runtime','node.exe'));
const license=await fetch(`https://raw.githubusercontent.com/nodejs/node/v${process.versions.node}/LICENSE`);
if(!license.ok)throw new Error('Could not retrieve license for bundled Node version');
await writeFile(join(folder,'runtime','LICENSE'),await license.text());
await writeFile(join(folder,'package.json'),JSON.stringify({private:true,type:'module',version},null,2));
await cp(join(root,'packages/node/dist'),join(folder,'app/node'),{recursive:true});
await cp(join(root,'packages/web/dist'),join(folder,'app/web'),{recursive:true});
for(const dependency of ['ws','@noble/curves','@noble/hashes','zod']) {
  await cp(join(root,'node_modules',dependency),join(folder,'node_modules',dependency),{recursive:true,dereference:true});
}
for(const dependency of ['protocol','shared']) {
  const target=join(folder,'node_modules/@aqua',dependency); await mkdir(target,{recursive:true});
  await copyFile(join(root,'packages',dependency,'package.json'),join(target,'package.json'));
  await cp(join(root,'packages',dependency,'dist'),join(target,'dist'),{recursive:true});
}
await copyFile(join(root,'index.html'),join(output,`Project-Aqua-${version}-demo.html`));
await copyFile(join(root,'docs/alpha-readiness.md'),join(folder,'READ-ME-FIRST.md'));
await writeFile(join(folder,'RUN_ALPHA.cmd'),`@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\nset "AQUA_ALPHA_TESTNET=1"\r\nset "AQUA_NODE_DB=%~dp0data\\alpha-v2.sqlite"\r\nset "AQUA_WEB_DIST=%~dp0app\\web"\r\nif not defined AQUA_NODE_PORT set "AQUA_NODE_PORT=8787"\r\necho Project Aqua alpha TESTNET - test accounts and funds only.\r\necho Open http://127.0.0.1:%AQUA_NODE_PORT% in your browser.\r\necho Keep this window open while using the alpha. Ctrl+C stops it.\r\n"%~dp0runtime\\node.exe" "%~dp0app\\node\\server.js"\r\npause\r\n`);
const zip=join(output,`${name}.zip`);
// Paths are supplied through environment variables, never interpolated as shell code.
const packed=spawnSync('powershell.exe',['-NoProfile','-Command','Add-Type -AssemblyName System.IO.Compression.FileSystem; if ([IO.File]::Exists($env:AQUA_PACKAGE_ZIP)) { [IO.File]::Delete($env:AQUA_PACKAGE_ZIP) }; [IO.Compression.ZipFile]::CreateFromDirectory($env:AQUA_PACKAGE_FOLDER, $env:AQUA_PACKAGE_ZIP, [IO.Compression.CompressionLevel]::Fastest, $true)'],{env:{...process.env,AQUA_PACKAGE_FOLDER:folder,AQUA_PACKAGE_ZIP:zip},stdio:'inherit',windowsHide:true});
if(packed.status!==0)throw new Error('ZIP packaging failed');
const assets=[zip,join(output,`Project-Aqua-${version}-demo.html`)];
const hashes=[];for(const asset of assets)hashes.push(`${createHash('sha256').update(await readFile(asset)).digest('hex')}  ${asset.slice(output.length+1)}`);
await writeFile(join(output,'SHA256SUMS.txt'),hashes.join('\n')+'\n');
console.log(`Portable alpha package: ${zip}; Node ${process.versions.node}`);
