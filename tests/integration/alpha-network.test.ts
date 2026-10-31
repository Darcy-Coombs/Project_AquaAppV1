import { afterAll, beforeAll, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { createEvent, createKeyPair, hashHex, replayEvents, tallyProposal, type AquaEvent } from "../../packages/protocol/src/index.js";
import { GENESIS_EARTH_SUPPLY } from "../../packages/shared/src/index.js";

const folder=mkdtempSync(join(tmpdir(),"aqua-alpha-network-"));
let child:ChildProcess; let url=""; let port=0; let clock=Date.now()-1000;
const people=Array.from({length:5},(_,i)=>({...createKeyPair(hashHex(`network-${i}`)),id:`test-${i}`}));
async function freePort(){return await new Promise<number>(resolve=>{const server=createServer();server.listen(0,"127.0.0.1",()=>{const address=server.address() as {port:number};server.close(()=>resolve(address.port));});});}
async function start(){
  child=spawn(process.execPath,["--loader","./ts-loader.mjs","src/server.ts"],{cwd:fileURLToPath(new URL("../../packages/node/",import.meta.url)),env:{...process.env,AQUA_NODE_PORT:String(port),AQUA_NODE_DB:join(folder,"alpha.sqlite"),AQUA_ALPHA_TESTNET:"1"},stdio:"ignore",windowsHide:true});
  for(let i=0;i<100;i++){try{if((await fetch(`${url}/health`)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error("Alpha test server failed to start");
}
async function stop(){if(child && child.exitCode===null){const exit=new Promise<void>(resolve=>child.once("exit",()=>resolve()));child.kill();await exit;}}
async function events():Promise<AquaEvent[]>{return (await (await fetch(`${url}/events`)).json() as {events:AquaEvent[]}).events;}
async function signed(actor:number,type:AquaEvent["type"],payload:unknown,signer=actor){
  const known=await events();clock=Math.max(clock+1,Date.now(),...known.map(e=>Date.parse(e.createdAt)+1));
  return createEvent({type,author:people[actor]!.id,publicKey:people[signer]!.publicKey,privateKey:people[signer]!.privateKey,payload,parents:known.slice(-2).map(e=>e.eventId),createdAt:new Date(clock).toISOString()});
}
async function post(event:AquaEvent){return fetch(`${url}/events`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(event)});}
async function send(actor:number,type:AquaEvent["type"],payload:unknown){const event=await signed(actor,type,payload);const response=await post(event);expect(response.status,await response.text()).toBe(202);return event;}
async function register(actor:number){await send(actor,"identity.created",{userId:people[actor]!.id,verificationLevel:"email"});await send(actor,"identity.verified",{userId:people[actor]!.id,method:"manual_dev",proofHash:hashHex(actor)});}
function period(){const now=new Date();return `${now.getUTCFullYear()}-w${Math.floor((now.getTime()-Date.UTC(now.getUTCFullYear(),0,1))/(7*86400000))+1}`;}
beforeAll(async()=>{port=await freePort();url=`http://127.0.0.1:${port}`;await start();},30000);
afterAll(async()=>{await stop();rmSync(folder,{recursive:true,force:true});});

it("serialises concurrent double-spends and duplicate claims, enforces all transports and survives restart",async()=>{
  for(const actor of [0,1,2])await register(actor);
  const claim=await signed(0,"money.ubi_claimed",{userId:"test-0",epoch:period(),verification_method:"pohw_lite"});
  const duplicateResults=await Promise.all([post(claim),post(claim)]);expect(duplicateResults.map(r=>r.status)).toEqual([202,202]);
  await send(1,"money.ubi_claimed",{userId:"test-1",epoch:period(),verification_method:"pohw_lite"});
  const one=await signed(0,"money.transfer",{from:"test-0",to:"test-1",amountMinor:"30000"});
  const two=await signed(0,"money.transfer",{from:"test-0",to:"test-2",amountMinor:"30000"});
  const spending=await Promise.all([post(one),post(two)]);expect(spending.filter(r=>r.status===202)).toHaveLength(1);expect(spending.filter(r=>r.status===422)).toHaveLength(1);
  let snapshot=await (await fetch(`${url}/ledger`)).json() as {conservedTotal:string;sump:string;head:string;eventCount:number};
  expect(snapshot.conservedTotal).toBe(GENESIS_EARTH_SUPPLY.toString());expect(snapshot.sump).toBe("1200");
  const forged=await signed(0,"money.transfer",{from:"test-0",to:"test-1",amountMinor:"100"},1);
  expect((await post(forged)).status).toBe(422);
  await new Promise<void>((resolve,reject)=>{
    const socket=new WebSocket(url.replace("http:","ws:")+"/gossip");
    const timeout=setTimeout(()=>{socket.close();reject(new Error("No WebSocket rejection"));},5000);
    socket.on("message",data=>{const message=JSON.parse(String(data));if(message.type==="hello")socket.send(JSON.stringify(forged));if(message.type==="rejected"){clearTimeout(timeout);socket.close();resolve();}});socket.on("error",reject);
  });
  const bundle=await fetch(`${url}/bundle`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({bundleVersion:1,events:[forged]})});
  expect(bundle.status).toBe(207);expect((await bundle.json() as {inserted:number}).inserted).toBe(0);
  const historical=await signed(0,"money.ubi_claimed",{userId:"test-0",epoch:"1900-w1",verification_method:"pohw_lite"});expect((await post(historical)).status).toBe(422);
  const committed=await events();expect(replayEvents(committed).rejected).toEqual([]);
  const prior=snapshot;await stop();await start();snapshot=await (await fetch(`${url}/ledger`)).json() as typeof snapshot;
  expect(snapshot).toEqual(prior);expect((await post(claim)).status).toBe(202);expect((await events()).length).toBe(prior.eventCount);
},60000);

it("runs a multi-account public ballot with a snapshot and rejects impersonation, duplicate and late votes",async()=>{
  await send(0,"governance.proposal_created",{proposalId:"alpha-vote",title:"Public test",body:"No production authority",closesAt:new Date(Date.now()+3000).toISOString(),publicTestConsent:true});
  const ballot={proposalId:"alpha-vote",voter:"test-0",choice:"yes",publicTestConsent:true};
  expect((await post(await signed(0,"governance.vote_cast",ballot,1))).status).toBe(422);
  await send(0,"governance.vote_cast",ballot);
  expect((await post(await signed(0,"governance.vote_cast",{...ballot,choice:"no"}))).status).toBe(422);
  await register(3);
  expect((await post(await signed(3,"governance.vote_cast",{...ballot,voter:"test-3"}))).status).toBe(422);
  await send(1,"governance.vote_cast",{...ballot,voter:"test-1",choice:"no"});
  const state=replayEvents(await events());expect(tallyProposal(state,"alpha-vote")).toEqual({yes:1,no:1,abstain:0});expect(state.proposals.get("alpha-vote")!.eligible).toHaveLength(3);
  await new Promise(resolve=>setTimeout(resolve,3100));
  const late=await signed(2,"governance.vote_cast",{...ballot,voter:"test-2"});expect((await post(late)).status).toBe(422);
  expect((await (await fetch(`${url}/ledger`)).json() as {conservedTotal:string}).conservedTotal).toBe(GENESIS_EARTH_SUPPLY.toString());
},30000);
