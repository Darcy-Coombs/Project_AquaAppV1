import React, { useEffect, useMemo, useState } from "react";
import { createEvent, createKeyPair, hashHex, replayEvents, tallyProposal, type AquaEvent } from "@aqua/protocol";
import { aqua, formatAqua, GENESIS_EARTH_SUPPLY } from "@aqua/shared";
import { db, type StoredKey } from "./storage.js";

type Ledger = { head: string; eventCount: number; earthRemaining: string; sump: string; circulatingAqua: string; lockedAqua: string; conservedTotal: string; wallets: { userId: string; balance: string; earthReceived: string; firePaid: string }[]; fundingAlerts: string[] };
type Health = { mode?: string; finality?: string; publicTestVoting?: boolean; now?: number };
const epoch = (now: number) => { const date=new Date(now); return `${date.getUTCFullYear()}-w${Math.floor((now-Date.UTC(date.getUTCFullYear(),0,1))/(7*86400000))+1}`; };

export function AlphaNetwork({ view, identity, nodeUrl, demo, refreshLocal }: { view: string; identity: StoredKey | null; nodeUrl: string; demo: boolean; refreshLocal: () => Promise<void> }) {
  const [health,setHealth]=useState<Health|null>(null);
  const [ledger,setLedger]=useState<Ledger|null>(null);
  const [events,setEvents]=useState<AquaEvent[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [failure,setFailure]=useState("");
  const [recipient,setRecipient]=useState("");
  const [amount,setAmount]=useState("100");
  const [title,setTitle]=useState("");
  const [consent,setConsent]=useState(false);
  const [retry,setRetry]=useState<AquaEvent|null>(null);
  const visible=!demo && ["dashboard","wallet","decisions"].includes(view);
  const state=useMemo(()=>replayEvents(events),[events]);
  const wallet=ledger?.wallets.find(w=>w.userId===identity?.userId);
  async function read<T>(path: string): Promise<T> {
    const response=await fetch(`${nodeUrl}${path}`,{signal:AbortSignal.timeout(5000)});
    if(!response.ok) throw new Error(`Authority unavailable (${response.status})`);
    return await response.json() as T;
  }
  async function refresh() {
    const [nextHealth,nextLedger,nextEvents]=await Promise.all([read<Health>("/health"),read<Ledger>("/ledger"),read<{events:AquaEvent[]}>("/events")]);
    setHealth(nextHealth);setLedger(nextLedger);setEvents(nextEvents.events);
    return {health:nextHealth,events:nextEvents.events};
  }
  useEffect(()=> { if(visible) void refresh().catch(()=> {setHealth(null);setLedger(null);}); },[nodeUrl,view,demo,identity?.publicKey]);
  async function operation(work:()=>Promise<void>) {
    if(busy)return;setBusy(true);setMessage("");setFailure("");
    try {await work();} catch(error){setFailure(error instanceof Error?error.message:"Operation failed");} finally {setBusy(false);}
  }
  async function deliver(event:AquaEvent) {
    let response:Response;
    try {response=await fetch(`${nodeUrl}/events`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(event),signal:AbortSignal.timeout(7000)});}
    catch {await db.queue.put(event);setRetry(event);throw new Error("No confirmation received. This request is pending, not paid. Reconnect and retry the same signed request.");}
    const result=await response.json() as {error?:string;inserted?:boolean};
    if(!response.ok) {await db.queue.delete(event.eventId);setRetry(null);throw new Error(`Rejected: ${result.error??response.status}`);}
    await db.events.put(event);await db.queue.delete(event.eventId);setRetry(null);
    const remote=await refresh();
    for(const item of remote.events) await db.events.put(item);
    await refreshLocal();
    setMessage("Confirmed by the selected alpha authority. Test funds only.");
  }
  async function signed(pair:StoredKey,type:AquaEvent["type"],payload:unknown) {
    const remote=await refresh();
    if(remote.health.mode!=="alpha-testnet")throw new Error("Select an alpha testnet authority in Settings.");
    const latest=Math.max(0,...remote.events.map(e=>Date.parse(e.createdAt)));
    return createEvent({type,author:pair.userId,publicKey:pair.publicKey,privateKey:pair.privateKey,payload,parents:remote.events.slice(-2).map(e=>e.eventId),createdAt:new Date(Math.max(remote.health.now??Date.now(),latest+1)).toISOString()});
  }
  async function register() {
    const stored=identity??(await db.keys.toArray())[0];
    const pair=stored??(()=> {const keys=createKeyPair();return {...keys,id:"primary",userId:`alpha-${keys.publicKey.slice(0,16)}`};})();
    const remote=await refresh();
    if(!remote.health.publicTestVoting)throw new Error("Start RUN_ALPHA.cmd to explicitly enable the alpha testnet.");
    if(!stored)await db.keys.put(pair);
    const existing=replayEvents(remote.events).identities.get(pair.userId);
    if(existing && existing.publicKey!==pair.publicKey)throw new Error("This account ID belongs to a different key on the authority.");
    if(!existing)await deliver(await signed(pair,"identity.created",{userId:pair.userId,verificationLevel:"email"}));
    await deliver(await signed(pair,"identity.verified",{userId:pair.userId,method:"manual_dev",proofHash:hashHex({alpha:pair.publicKey}),verification_method:"manual_dev"}));
    await refreshLocal();setMessage("Alpha test account registered. This is not proof of unique humanity or BranchID admission.");
  }
  const canAct=!!identity && state.identities.has(identity.userId) && !!health?.publicTestVoting;
  return <section hidden={!visible} className="aqua-card alpha-network">
    <div className="section-top"><div><p className="eyebrow">Shared alpha testnet · one ordering authority</p><h3>{view==="decisions"?"Public alpha decisions":view==="wallet"?"Confirmed network wallet":"Network funds & account"}</h3></div><button className="quiet" disabled={busy} onClick={()=>void operation(async()=>{await refresh();setMessage("Authority state refreshed.");})}>Refresh authority</button></div>
    <p className="caption">{health?`Connected to ${nodeUrl}. All participants must use this same authority.`:"Authority not connected. Run the downloadable alpha server, or set its URL in More & settings. The isolated demo works without it."} These are test accounts and test funds. This server does not provide decentralised consensus, private voting or human uniqueness.</p>
    {busy&&<p role="status">Waiting for authority confirmation…</p>}{failure&&<p role="alert" className="notice error">{failure}</p>}{message&&<p role="status" className="notice">{message}</p>}{retry&&<button disabled={busy} onClick={()=>void operation(()=>deliver(retry))}>Retry pending signed request</button>}
    {health&&<>
      <div className="action-row"><button disabled={busy||!health.publicTestVoting} onClick={()=>void operation(register)}>{identity?"Register these keys on alpha":"Create alpha test account"}</button><button disabled={busy||!canAct} onClick={()=>void operation(async()=>{const now=health.now??Date.now();await deliver(await signed(identity!,"money.ubi_claimed",{userId:identity!.userId,epoch:epoch(now),verification_method:"pohw_lite"}));})}>Claim funded alpha UBI</button></div>
      {identity&&<><label htmlFor="alpha-receive">Your alpha account ID · share this to receive</label><input id="alpha-receive" readOnly value={identity.userId}/></>}
      <dl className="status-list"><div><dt>Confirmed account balance</dt><dd data-testid="alpha-balance">{formatAqua(BigInt(wallet?.balance??"0"))} Aqua</dd></div><div><dt>Earth received / lifetime allowance</dt><dd>{formatAqua(BigInt(wallet?.earthReceived??"0"))} / 100,000.00</dd></div><div><dt>Fire contributed</dt><dd>{formatAqua(BigInt(wallet?.firePaid??"0"))} Aqua</dd></div></dl>
      {ledger&&<details><summary>Global alpha accounting · {ledger.eventCount} confirmed events</summary><dl className="status-list"><div><dt>Earth remaining</dt><dd>{formatAqua(BigInt(ledger.earthRemaining))}</dd></div><div><dt>Circulating Aqua</dt><dd>{formatAqua(BigInt(ledger.circulatingAqua))}</dd></div><div><dt>Locked reserve Aqua</dt><dd>{formatAqua(BigInt(ledger.lockedAqua))}</dd></div><div><dt>Sump funded by Fire</dt><dd>{formatAqua(BigInt(ledger.sump))}</dd></div><div><dt>Conservation check</dt><dd>{BigInt(ledger.conservedTotal)===GENESIS_EARTH_SUPPLY?"Balanced":"Mismatch — stop testing and investigate"}</dd></div></dl><p className="break-word">Ledger head: {ledger.head}</p><p>Fire is a transfer into Sump, not extra money. After the 100,000 Earth allowance, UBI depends on Sump availability. Shortfalls remain unpaid; they do not create debt or new money.</p></details>}
      {view==="wallet"&&<><h3>Send test Aqua</h3><label htmlFor="alpha-to">Registered recipient alpha ID</label><input id="alpha-to" value={recipient} onChange={e=>setRecipient(e.target.value)}/><label htmlFor="alpha-amount">Total Aqua deducted from your balance</label><input id="alpha-amount" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/><p>4% goes to Sump; the recipient gets 96%. Fractions below one minor unit are rounded down for Fire.</p><button disabled={busy||!canAct} onClick={()=>void operation(async()=>{await deliver(await signed(identity!,"money.transfer",{from:identity!.userId,to:recipient.trim(),amountMinor:aqua(Number(amount)).toString()}));})}>Send confirmed alpha payment</button><h3>Confirmed history</h3>{events.filter(e=>e.type.startsWith("money.")&&(e.author===identity?.userId||(e.payload as {to?:string}).to===identity?.userId)).slice(-20).reverse().map(e=><p key={e.eventId}>{e.type==="money.transfer"?"Transfer":"UBI claim"} · {new Date(e.createdAt).toLocaleString()} · confirmed test event</p>)}</>}
      {view==="decisions"&&<><p className="notice">Public test ballots only. Signed choices are visible to every participant. These decisions cannot change production entitlements or bypass BranchID growth gates.</p><label className="check-label"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I consent to publicly signed alpha test votes.</label><label htmlFor="alpha-proposal-title">Test proposal title</label><input id="alpha-proposal-title" maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/><button disabled={busy||!canAct||!consent||!title.trim()} onClick={()=>void operation(async()=>{await deliver(await signed(identity!,"governance.proposal_created",{proposalId:crypto.randomUUID(),title:title.trim(),body:"Public alpha test decision. No production authority.",publicTestConsent:true,closesAt:new Date((health.now??Date.now())+7*86400000).toISOString()}));setTitle("");})}>Open public alpha proposal</button>{[...state.proposals.values()].map(proposal=>{const tally=tallyProposal(state,proposal.proposalId);const closed=(health.now??Date.now())>=Date.parse(proposal.closesAt);return <article className="review-record" key={proposal.proposalId}><h3>{proposal.title}</h3><p>{closed?"Closed":"Open"} · eligible snapshot {proposal.eligible.length} · yes {tally.yes}, no {tally.no}, abstain {tally.abstain}</p><p>Closes {new Date(proposal.closesAt).toLocaleString()}. One ballot per eligible account; an account is not proof of a unique person.</p><div className="action-row">{(["yes","no","abstain"] as const).map(choice=><button key={choice} disabled={busy||!consent||!canAct||closed||!proposal.eligible.includes(identity!.userId)||proposal.votes.has(identity!.userId)} onClick={()=>void operation(async()=>{await deliver(await signed(identity!,"governance.vote_cast",{proposalId:proposal.proposalId,voter:identity!.userId,choice,publicTestConsent:true}));})}>Alpha vote {choice}</button>)}</div></article>;})}</>}
    </>}
  </section>;
}
