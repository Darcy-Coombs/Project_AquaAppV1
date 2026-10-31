import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
const root=process.cwd(), output=join(root,'output/releases');
const scratch=await mkdtemp(join(output,'package-check-'));
const unzip=spawnSync('powershell.exe',['-NoProfile','-Command','Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($env:AQUA_ZIP, $env:AQUA_EXTRACT)'],{env:{...process.env,AQUA_ZIP:join(output,'Project-Aqua-1.1.0-alpha.1-win-x64.zip'),AQUA_EXTRACT:scratch},stdio:'inherit',windowsHide:true});
if(unzip.status!==0)throw new Error('Extraction failed');
const folder=join(scratch,'Project-Aqua-1.1.0-alpha.1-win-x64');
await mkdir(join(folder,'data'),{recursive:true});
const port=await new Promise(resolve=>{const server=createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const url=`http://127.0.0.1:${port}`;
const child=spawn(join(folder,'runtime/node.exe'),[join(folder,'app/node/server.js')],{cwd:folder,env:{...process.env,AQUA_NODE_PORT:String(port),AQUA_NODE_DB:join(folder,'data/smoke.sqlite'),AQUA_WEB_DIST:join(folder,'app/web'),AQUA_ALPHA_TESTNET:'1'},stdio:'inherit',windowsHide:true});
try {
  let ready=false;for(let i=0;i<100;i++){try{const response=await fetch(url+'/health');if(response.ok){const health=await response.json();if(health.genesisEarthMinor!=='70000000000000000')throw new Error('Wrong genesis');ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  if(!ready)throw new Error('Packaged runtime failed to start');
  if(!(await fetch(url)).ok)throw new Error('Packaged UI missing');
  const result=spawnSync('npx.cmd',['playwright','test','tests/e2e/alpha-network.spec.ts','--workers','1'],{cwd:root,env:{...process.env,AQUA_WEB_URL:url},stdio:'inherit',shell:true,windowsHide:true});
  if(result.status!==0)throw new Error('Packaged browser checks failed');
  let ledger;
  for(let attempt=0;attempt<3;attempt++) {
    try {ledger=await (await fetch(url+'/ledger',{headers:{Connection:'close'}})).json();break;}
    catch(error){if(attempt===2)throw error;}
  }
  if(ledger.conservedTotal!=='70000000000000000'||ledger.pending||ledger.rejected)throw new Error('Packaged ledger invariant failed');
  console.log(JSON.stringify({packagedRuntime:'passed',ledgerEvents:ledger.eventCount,conservedTotal:ledger.conservedTotal,extractedFolder:scratch}));
}finally{child.kill();}
