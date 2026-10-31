import { describe, expect, it } from "vitest";
import { aqua, AQUA_SCALE, EARTH_UBI_CAP_PER_ACCOUNT, GENESIS_EARTH_SUPPLY, WEEKLY_UBI_AQUA } from "../../packages/shared/src/index.js";
import { createEvent, createKeyPair, hashHex, replayEvents, tallyProposal, type AquaEvent } from "../../packages/protocol/src/index.js";

function fixture(count = 3) {
  const people = Array.from({ length: count }, (_, i) => ({ ...createKeyPair(hashHex(`alpha-test-${i}`)), id: `member-${i}` }));
  const events: AquaEvent[] = [];
  let time = Date.UTC(2026,0,1);
  const add = (actor: number, type: AquaEvent["type"], payload: unknown, signingActor = actor) => {
    const person = people[actor]!; const signer = people[signingActor]!;
    const event = createEvent({ type, author: person.id, ...signer, payload, parents: events.slice(-1).map(e => e.eventId), createdAt: new Date(time++).toISOString() });
    events.push(event); return event;
  };
  people.forEach((person,i) => { add(i,"identity.created",{userId:person.id,verificationLevel:"email"}); add(i,"identity.verified",{userId:person.id,method:"pohw_lite",proofHash:hashHex(person.id)}); });
  const claim = (actor: number, period: number) => add(actor,"money.ubi_claimed",{userId:people[actor]!.id,epoch:`test-period-${period}`,verification_method:"pohw_lite"});
  const transfer = (from: number, to: number, amount: bigint) => add(from,"money.transfer",{from:people[from]!.id,to:people[to]!.id,amountMinor:amount.toString()});
  return { people, events, add, claim, transfer };
}
function conserved(state: ReturnType<typeof replayEvents>) {
  return state.earthRemaining+state.sump+[...state.wallets.values()].reduce((n,w) => n+w.balance,0n)+[...state.pools.values()].reduce((n,p)=>n+p.reserve,0n);
}
describe("Earth, Aqua and Fire accounting", () => {
  it("never overdraws a depleted global Earth reserve and only pays available Sump", () => {
    const f=fixture(); f.claim(0,0); f.claim(1,0); f.claim(2,0);
    let state=replayEvents(f.events,{genesisEarthSupply:aqua(600)});
    expect(state.earthRemaining).toBe(0n);
    expect(state.wallets.get("member-0")!.balance).toBe(aqua(480));
    expect(state.wallets.get("member-1")!.balance).toBe(aqua(120));
    expect(state.wallets.get("member-2")!.balance).toBe(0n);
    f.transfer(0,1,aqua(100)); f.claim(2,0);
    state=replayEvents(f.events,{genesisEarthSupply:aqua(600)});
    expect(state.wallets.get("member-2")!.balance).toBe(aqua(4));
    expect(state.sump).toBe(0n); expect(state.earthRemaining).toBe(0n);
    expect(conserved(state)).toBe(aqua(600)); expect(state.rejected).toEqual([]);
  });
  it("uses exact bigint arithmetic for seven billion allowances without allocating billions of accounts", () => {
    expect(7_000_000_000n*EARTH_UBI_CAP_PER_ACCOUNT).toBe(700_000_000_000_000n*AQUA_SCALE);
    expect(GENESIS_EARTH_SUPPLY).toBe(7_000_000_000n*EARTH_UBI_CAP_PER_ACCOUNT);
    expect(EARTH_UBI_CAP_PER_ACCOUNT).toBe(aqua(100000));
    expect(WEEKLY_UBI_AQUA).toBe(aqua(480));
    expect(700_000_000_000_000n*AQUA_SCALE > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
  });
  it("conserves money through 128 identities, 384 claims and 2048 transfers, including shuffled replay", () => {
    const f=fixture(128); for(let period=0;period<3;period++) for(let i=0;i<128;i++) f.claim(i,period);
    for(let i=0;i<2048;i++) f.transfer(i%128,(i+1)%128,BigInt(100+(i%101)));
    const state=replayEvents(f.events);
    expect(state.rejected).toEqual([]); expect(state.pending).toEqual([]);
    expect(conserved(state)).toBe(GENESIS_EARTH_SUPPLY);
    expect(state.earthRemaining).toBe(GENESIS_EARTH_SUPPLY-384n*WEEKLY_UBI_AQUA);
    expect([...state.wallets.values()].every(w=>w.balance>=0n && w.earthReceived===3n*WEEKLY_UBI_AQUA)).toBe(true);
    expect(state.sump).toBe([...state.wallets.values()].reduce((n,w)=>n+w.firePaid,0n));
    const reversed=replayEvents([...f.events].reverse());
    expect(reversed.wallets).toEqual(state.wallets); expect(reversed.sump).toBe(state.sump); expect(conserved(reversed)).toBe(GENESIS_EARTH_SUPPLY);
  },120000);
  it("stops Earth at 100k, pays from Fire/Sump, records shortfall and allows a funded top-up only", () => {
    const f=fixture(2);
    for(let period=0;period<209;period++) f.claim(0,period);
    let state=replayEvents(f.events);
    expect(state.wallets.get("member-0")!.earthReceived).toBe(aqua(100000));
    expect(state.wallets.get("member-0")!.balance).toBe(aqua(100000));
    expect(state.ubiPayments.get("member-0:test-period-208")!.total).toBe(aqua(160));
    expect(state.ubiClaims.has("member-0:test-period-208")).toBe(false);
    f.claim(1,0); f.transfer(1,0,aqua(100)); f.claim(0,208);
    state=replayEvents(f.events);
    expect(state.ubiPayments.get("member-0:test-period-208")).toEqual({earth:aqua(160),sump:aqua(4),total:aqua(164)});
    expect(state.sump).toBe(0n); expect(conserved(state)).toBe(GENESIS_EARTH_SUPPLY);
    expect(state.autoProposals.filter(p=>p==="funding-shortfall:test-period-208")).toHaveLength(1);
    expect(state.wallets.get("member-0")!.earthReceived).toBe(aqua(100000));
  },30000);
  it("rejects forged transfers without changing balances, and rejects duplicate successful claims", () => {
    const f=fixture(); f.claim(0,0);
    const before=replayEvents(f.events);
    f.add(0,"money.transfer",{from:"member-0",to:"member-1",amountMinor:"10000"},1);
    const after=replayEvents(f.events);
    expect(after.rejected[0]!.reason).toMatch(/signing key/); expect(after.wallets).toEqual(before.wallets);
    f.events.pop(); f.claim(0,0);
    expect(replayEvents(f.events).rejected[0]!.reason).toMatch(/Duplicate UBI/);
  });
  it("handles self transfers and penny rounding without minting or negative balances", () => {
    const f=fixture(); f.claim(0,0); f.transfer(0,0,10000n); f.transfer(0,1,1n);
    const state=replayEvents(f.events);
    expect(state.wallets.get("member-0")!.balance).toBe(48000n-400n-1n);
    expect(state.wallets.get("member-1")!.balance).toBe(1n); expect(state.sump).toBe(400n); expect(conserved(state)).toBe(GENESIS_EARTH_SUPPLY);
  });
  it("propagates missing and rejected dependencies and rejects a second identity for the same key", () => {
    const f=fixture(); const base=f.events.slice();
    const missing=createEvent({type:"node.peer_seen",author:"peer",...f.people[0]!,parents:["missing"],payload:{}});
    const child=createEvent({type:"node.peer_seen",author:"peer",...f.people[0]!,parents:[missing.eventId],payload:{}});
    expect(replayEvents([child,missing,...base]).pending).toHaveLength(2);
    const duplicate=createEvent({type:"identity.created",author:"other-id",...f.people[0]!,payload:{userId:"other-id",verificationLevel:"email"},parents:[base.at(-1)!.eventId]});
    expect(replayEvents([...base,duplicate]).rejected[0]!.reason).toMatch(/already owns/);
  });
  it("protects pool deposits and redemptions from other members and preserves total money", () => {
    const f=fixture(); f.claim(0,0);
    f.add(0,"chat.room_created",{roomId:"room",name:"Test room",inviteCodeHash:"invitation",creator:"member-0"});
    f.add(1,"chat.member_joined",{roomId:"room",userId:"member-1",inviteCodeHash:"invitation"});
    f.add(0,"dex.pool_created",{poolId:"pool",roomId:"room",maintainer:"member-0"});
    f.add(0,"dex.pool_deposit",{poolId:"pool",roomId:"room",userId:"member-0",amountMinor:"10000"});
    f.add(1,"dex.pool_release_aqua",{poolId:"pool",roomId:"room",userId:"member-1",amountMinor:"10000"});
    expect(replayEvents(f.events).rejected[0]!.reason).toMatch(/your deposit/); f.events.pop();
    f.add(1,"dex.pool_mint_room_credit",{poolId:"pool",roomId:"room",userId:"member-1",amountMinor:"10000"});
    expect(replayEvents(f.events).rejected[0]!.reason).toMatch(/your unminted deposit/); f.events.pop();
    f.add(0,"dex.pool_mint_room_credit",{poolId:"pool",roomId:"room",userId:"member-0",amountMinor:"10000"});
    f.add(0,"chat.transfer",{roomId:"room",from:"member-0",to:"member-1",amountMinor:"5000",asset:"ROOM_CREDIT",nonce:1,prevHash:"genesis"});
    f.add(1,"dex.pool_burn_room_credit",{poolId:"pool",roomId:"room",userId:"member-1",amountMinor:"5000"});
    f.add(1,"dex.pool_release_aqua",{poolId:"pool",roomId:"room",userId:"member-1",amountMinor:"5000"});
    const state=replayEvents(f.events); expect(state.rejected).toEqual([]); expect(state.wallets.get("member-1")!.balance).toBe(5000n); expect(conserved(state)).toBe(GENESIS_EARTH_SUPPLY);
  });
  it("applies the same 4% Fire when Aqua is sent inside a chat room", () => {
    const f=fixture(); f.claim(0,0);
    f.add(0,"chat.room_created",{roomId:"r",name:"r",inviteCodeHash:"i",creator:"member-0"});
    f.add(1,"chat.member_joined",{roomId:"r",userId:"member-1",inviteCodeHash:"i"});
    f.add(0,"chat.transfer",{roomId:"r",from:"member-0",to:"member-1",amountMinor:"10000",asset:"AQUA",nonce:1,prevHash:"genesis"});
    const state=replayEvents(f.events); expect(state.rejected).toEqual([]); expect(state.wallets.get("member-1")!.balance).toBe(9600n); expect(state.sump).toBe(400n); expect(conserved(state)).toBe(GENESIS_EARTH_SUPPLY);
  });
});
describe("authenticated equal-account alpha ballots",()=>{
  it("rejects impersonation, duplicate votes and out-of-window choices",()=>{
    const f=fixture(); f.add(0,"governance.proposal_created",{proposalId:"p",title:"A test",body:"Public alpha test vote",closesAt:"2026-01-08T00:00:00.000Z"});
    f.add(0,"governance.vote_cast",{proposalId:"p",voter:"member-0",choice:"yes"},1);
    expect(replayEvents(f.events).rejected[0]!.reason).toMatch(/signing key/); f.events.pop();
    f.add(0,"governance.vote_cast",{proposalId:"p",voter:"member-0",choice:"yes"});
    f.add(0,"governance.vote_cast",{proposalId:"p",voter:"member-0",choice:"no"});
    expect(replayEvents(f.events).rejected[0]!.reason).toMatch(/Duplicate vote/); f.events.pop();
    const late=createEvent({type:"governance.vote_cast",author:"member-1",...f.people[1]!,parents:[f.events.at(-1)!.eventId],createdAt:"2026-01-08T00:00:00.000Z",payload:{proposalId:"p",voter:"member-1",choice:"no"}});
    expect(replayEvents([...f.events,late]).rejected[0]!.reason).toMatch(/closed/);
    expect(tallyProposal(replayEvents(f.events),"p")).toEqual({yes:1,no:0,abstain:0});
  });
});
