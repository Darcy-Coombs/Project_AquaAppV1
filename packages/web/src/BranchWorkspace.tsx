import React, { useState } from "react";
import { branchCommand, branchDiagnostics, branchEligibility, branchPeriod, createBranchDemo, hashHex, invitationsAvailable, memberForKey, validateBranchCommand, type BranchBody, type BranchCommand, type BranchMember } from "@aqua/protocol";
import { formatAqua } from "@aqua/shared";
import type { StoredKey } from "./storage.js";
import "./branchid.css";

const PENDING_KEY = "aqua-branchid-pending-v1";
const short = (value: string) => `${value.slice(0, 7)}…${value.slice(-4)}`;
function loadPending(): BranchCommand[] {
  try { const values = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]") as BranchCommand[]; return values.filter(c => { try { validateBranchCommand(c, c.community); return c.body.kind === "join"; } catch { return false; } }); } catch { return []; }
}

export function BranchWorkspace({ view, identity, balance, navigate, onDemoChange }: { view: string; identity: StoredKey | null; balance: bigint; navigate: (view: "identity" | "wallet" | "community" | "decisions" | "export") => void; onDemoChange: (active: boolean) => void }) {
  const [demo, setDemo] = useState<ReturnType<typeof createBranchDemo> | null>(null);
  const [actor, setActor] = useState(0);
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(loadPending);
  const [offline, setOffline] = useState(false);
  const [queue, setQueue] = useState<BranchCommand[]>([]);
  const [queueResults, setQueueResults] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [recipient, setRecipient] = useState("");
  const [inviteText, setInviteText] = useState("");
  const [reviewed, setReviewed] = useState<BranchCommand | null>(null);
  const [displayName, setDisplayName] = useState("You");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [listMode, setListMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [rationale, setRationale] = useState("Open the next generation with equal invitations and a bounded community capacity.");
  const [consent, setConsent] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [response, setResponse] = useState("");
  const [subject, setSubject] = useState("");
  const state = demo?.authority.state;
  const person = demo?.people[actor];
  const member = state && person ? memberForKey(state, person.publicKey) : undefined;
  const visible = ["dashboard", "community", "decisions"].includes(view) || (view === "wallet" && !!demo);
  const ownPending = pending.filter(p => p.key === identity?.publicKey);
  const active = state ? Object.values(state.members).filter(m => m.status === "admitted") : [];
  const now = demo?.time ?? Date.now();
  const eligibility = state && person ? branchEligibility(state, person.publicKey, now) : null;
  const proposals = state ? Object.values(state.proposals) : [];
  const selectedInvite = reviewed && state ? state.invites[hashHex(reviewed)] : undefined;
  const sponsor = selectedInvite && state ? state.members[selectedInvite.sponsor] : undefined;
  const graphMembers = state ? Object.values(state.members) : [];
  const children = new Map<string, BranchMember[]>();
  graphMembers.forEach(m => { if (m.sponsor) { const siblings = children.get(m.sponsor) ?? []; siblings.push(m); children.set(m.sponsor, siblings); } });
  const branches: BranchMember[] = [];
  const visit = (m: BranchMember) => { branches.push(m); if (!collapsed.includes(m.id)) children.get(m.id)?.forEach(visit); };
  graphMembers.filter(m => m.depth === 0).forEach(visit);
  const filtered = (listMode || search ? graphMembers : branches).filter(m => `${m.name} ${m.id}`.toLowerCase().includes(search.toLowerCase()));
  const rows = filtered.slice(page * 30, page * 30 + 30);

  function action(work: () => void) {
    setError(""); setMessage("");
    try { work(); setRevision(revision + 1); } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
  }
  function submit(value: BranchBody) {
    if (!demo || !person) throw new Error("Enter the isolated demo to exercise final admission and test voting.");
    const command = branchCommand(demo.authority.state.community, person, value);
    if (offline) { setQueue([...queue, command]); setMessage("Queued locally. No membership, vote or payment rights until demo authority acceptance."); return command; }
    demo.authority.submit(command, demo.time);
    setMessage("Finalised by the local demo authority. Simulated rights only.");
    return command;
  }
  function startDemo() {
    const next = createBranchDemo();
    setDemo(next); onDemoChange(true); setActor(0); setRecipient(next.people[4]!.publicKey); setQueue([]); setQueueResults([]); setOffline(false); setReviewed(null); setInviteText(""); setError(""); setMessage("Demo started. Four equal founders; no real data or transport is used.");
  }
  function inspectInvite() {
    setReviewed(null);
    let parsed: BranchCommand;
    try { parsed = JSON.parse(inviteText) as BranchCommand; }
    catch { throw new Error("This invitation is not valid JSON. Copy the complete signed invitation and try again."); }
    validateBranchCommand(parsed, demo?.authority.state.community ?? parsed.community);
    if (parsed.body.kind !== "invite") throw new Error("Paste a signed BranchID invitation.");
    if (parsed.body.expires <= now) throw new Error("This invitation has expired. Ask the inviter for a new one.");
    if (demo && !demo.authority.state.invites[hashHex(parsed)]) throw new Error("Invitation has not been accepted by this demo authority.");
    setReviewed(parsed);
  }
  function acceptInvite() {
    if (!reviewed || reviewed.body.kind !== "invite") throw new Error("Review an invitation first.");
    const pair = person ?? identity;
    if (!pair) throw new Error("Create or restore your keys first.");
    if (pair.publicKey !== reviewed.body.recipient) throw new Error("This invitation belongs to a different recipient key.");
    if (demo) submit({ kind: "join", invite: hashHex(reviewed), name: displayName });
    else {
      if (pending.some(p => p.key === pair.publicKey && p.community === reviewed.community)) throw new Error("An admission request is already pending for this community.");
      const command = branchCommand(reviewed.community, pair, { kind: "join", invite: hashHex(reviewed), name: displayName });
      const next = [...pending, command];
      localStorage.setItem(PENDING_KEY, JSON.stringify(next)); setPending(next);
      setMessage("Admission pending on this device. No trusted finality service is configured; reconnecting cannot grant membership or entitlements.");
    }
    setReviewed(null);
  }
  function reconnect() {
    if (!demo) return;
    const results: string[] = [];
    const waiting: BranchCommand[] = [];
    for (const command of queue) {
      try { demo.authority.submit(command, demo.time); results.push(`${command.body.kind}: finalised (demo)`); }
      catch (e) {
        const reason = e instanceof Error ? e.message : "invalid request";
        if (reason.includes("Missing invitation dependency")) { waiting.push(command); results.push(`${command.body.kind}: pending — missing invitation dependency`); }
        else results.push(`${command.body.kind}: rejected — ${reason}`);
      }
    }
    setQueueResults(results); setQueue(waiting); setOffline(waiting.length > 0); setRevision(revision + 1);
  }
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setMessage("Copied. This public payload contains no secret keys."); } catch { setError("Clipboard unavailable. Select and copy the text manually."); } };
  function memberRow(m: BranchMember) {
    return <li key={m.id} className="branch-row" style={{ paddingInlineStart: listMode ? 16 : 16 + m.depth * 20 }}>
      <span className="avatar">{m.name.slice(0, 1)}</span><span><strong>{m.name}</strong><small>{short(m.id)} · Generation {m.depth} · {m.sponsor ? `Invited by ${state?.members[m.sponsor]?.name}` : "Founder · one vote"}{m.status === "left" ? " · left" : ""}</small></span>
      {!!children.get(m.id)?.length && !listMode && <button className="quiet" aria-expanded={!collapsed.includes(m.id)} onClick={() => setCollapsed(collapsed.includes(m.id) ? collapsed.filter(i => i !== m.id) : [...collapsed, m.id])}>{collapsed.includes(m.id) ? "Expand" : "Collapse"}</button>}
    </li>;
  }
  return <div hidden={!visible} className="branch-workspace" data-revision={revision}>
    <div className={demo ? "mode-strip demo-strip" : "mode-strip"}>
      <span><span className="signal-dot" />{demo ? "ISOLATED DEMONSTRATION · simulated money & public test votes" : "EXPERIMENTAL PROTOTYPE · no production entitlements"}</span>
      <button className="quiet" onClick={() => { if (demo) { setDemo(null); onDemoChange(false); setQueue([]); setQueueResults([]); setReviewed(null); setInviteText(""); setMessage(""); setError(""); } else startDemo(); }}>{demo ? "Exit demo" : "Explore demo ↗"}</button>
    </div>
    {demo && <div className="demo-controls"><label>Act as <select aria-label="Demo identity" value={actor} onChange={e => { setActor(Number(e.target.value)); setConsent(false); }}>{demo.people.map((p, i) => <option key={p.publicKey} value={i}>{p.name}{i < 4 ? " · founder" : " · new member"}</option>)}</select></label><button className="quiet" onClick={() => offline ? reconnect() : setOffline(true)}>{offline ? `Reconnect & submit ${queue.length} queued` : "Simulate offline"}</button><span>{offline ? "Offline · drafts only" : "Local demo authority connected"}</span><button className="quiet" onClick={startDemo}>Reset demo</button></div>}
    <div aria-live="polite">{message && <p className="notice">{message}</p>}{error && <p role="alert" className="notice error">{error}</p>}{queueResults.length > 0 && <ul className="notice">{queueResults.map((result, i) => <li key={i}>{result}</li>)}</ul>}</div>

    {view === "wallet" && demo && <><header className="page-heading"><p className="eyebrow">Isolated from your existing wallet</p><h2>Your demo wallet</h2><p>Only simulated BranchID payments appear here.</p></header><section className="aqua-card"><h3>{formatAqua(BigInt(member ? state?.received[member.id] ?? "0" : "0"))} simulated Aqua</h3><p>Exit the demo to use your existing wallet’s payments and history.</p><label htmlFor="demo-receive">Demo public key</label><input id="demo-receive" readOnly value={person?.publicKey ?? ""} /><h3>Payment history</h3>{member && Object.entries(state!.claims).filter(([claim]) => claim.startsWith(`${member.id}:`)).map(([claim]) => <p key={claim}>Weekly UBI · {claim.split(":")[1]} · 480.00 simulated Aqua · finalised by demo authority</p>)}{!eligibility?.paid && <p>No payment in the current demo period.</p>}<button disabled={!eligibility?.canClaim} onClick={() => action(() => { submit({ kind: "claim", period: branchPeriod(now) }); })}>Claim 480 simulated Aqua</button></section></>}

    {view === "dashboard" && <>
      <header className="page-heading"><p className="eyebrow">A little more connected</p><h2>{demo ? `Welcome, ${person?.name}.` : identity ? "Welcome back." : "Your place in Aqua."}</h2><p>Keys you control. A community that recognises you.</p></header>
      <div className="home-grid"><section className="balance-hero"><div className="hero-top"><span>{demo ? "DEMO WALLET" : "AQUA WALLET"}</span><span>◈ AQUA</span></div><p className="balance-number" data-testid="branch-balance">{demo ? formatAqua(BigInt(member ? state?.received[member.id] ?? "0" : "0")) : formatAqua(balance)}</p><p>{demo ? "Simulated Aqua · separate from your wallet" : "Existing prototype balance · simulated Aqua"}</p><div className="hero-actions"><button onClick={() => navigate("wallet")}>Open wallet ↗</button><button className="hero-secondary" onClick={() => navigate("community")}>Your community</button></div><div className="hero-foot">Equal recognition. No rewards for recruiting.</div></section>
      <section className="aqua-card"><p className="eyebrow">Weekly UBI</p><h3>{eligibility?.paid ? "Paid in this demo period" : eligibility?.canClaim ? "Demo funding available" : "Recognition comes first"}</h3><dl className="status-list"><div><dt>Entitlement</dt><dd>{member ? "Recognised · demo only" : "Not activated"}</dd></div><div><dt>Funding</dt><dd>{demo ? `${formatAqua(BigInt(state!.funding))} simulated Aqua` : "No production funding connected"}</dd></div><div><dt>Payment</dt><dd>{eligibility?.paid ? "480.00 simulated Aqua paid" : "No payment issued"}</dd></div></dl>{demo ? <button disabled={!eligibility?.canClaim} onClick={() => action(() => { submit({ kind: "claim", period: branchPeriod(now) }); })}>Claim 480 simulated Aqua</button> : <button className="quiet" onClick={() => navigate("community")}>View admission status →</button>}<small>The existing rate and funding limits apply. Membership alone does not create money.</small></section></div>
      <div className="home-grid lower-grid"><section className="aqua-card"><p className="eyebrow">Your next step</p><h3>{member ? "Help your community grow thoughtfully." : identity || demo ? "Join a community." : "Start with keys you control."}</h3><p>{member ? "Invite someone you know. Every recognised member has one ordinary vote, including founders." : "A key proves control. An invitation starts recognition under a community’s rules; it cannot prove global unique humanity."}</p><button onClick={() => navigate(identity || demo ? "community" : "identity")}>{member ? "Manage invitations" : identity || demo ? "Review an invitation" : "Create or restore keys"} →</button></section><section className="aqua-card"><p className="eyebrow">Decide together</p><h3>{proposals.filter(p => p.result === "open").length} active growth decisions</h3><p>Expansion happens in stages. Your sponsor gets no extra vote, payment or authority over you.</p><button className="quiet" onClick={() => navigate("decisions")}>Go to decisions →</button></section></div>
    </>}

    {view === "community" && <>
      <header className="page-heading"><p className="eyebrow">Recognition, built together</p><h2>Your community</h2><p>A bounded community. An equal place for every member.</p></header>
      <div className="home-grid"><section className="membership-card"><div className="hero-top"><span>BRANCH ID</span><span className="status-chip">{member?.status ?? (ownPending.length ? "admission-pending" : "key-only")}{demo ? " · demo" : ""}</span></div><h3>{member?.name ?? identity?.userId ?? person?.name ?? "Your membership starts here"}</h3><p>{member ? short(member.id) : "Keys and community recognition are separate."}</p><dl className="status-list"><div><dt>Community</dt><dd>{demo ? "Aqua Commons · demo" : "Not yet recognised"}</dd></div><div><dt>Inviter</dt><dd>{member?.sponsor ? state?.members[member.sponsor]?.name : member ? "Bootstrap founder" : "—"}</dd></div><div><dt>Generation</dt><dd>{member?.depth ?? "—"}</dd></div><div><dt>Invitations available</dt><dd>{member ? invitationsAvailable(state!, member) : 0}</dd></div><div><dt>Ordinary votes</dt><dd>{member?.status === "admitted" ? "1 · simulated" : "0"}</dd></div></dl><details><summary>Advanced identity details</summary><p className="break-word">{person?.publicKey ?? identity?.publicKey ?? "Create keys first"}</p><p>Stable member ID survives a future authorised key rotation. Recovery and rotation are not implemented in this prototype.</p></details></section>
      <section className="aqua-card"><p className="eyebrow">Room to grow</p><h3>{state ? Object.keys(state.members).length : 0} <span className="muted">/ {state?.policy.released ?? 84} released places</span></h3><progress aria-label="Released capacity used" value={state ? Object.keys(state.members).length : 0} max={state?.policy.released ?? 84} /><p>Absolute limit: 2,500, including four founders.</p><div className="generation-track">{[0, 1, 2, 3].map(depth => <div key={depth} className={depth <= (state?.policy.depth ?? 1) ? "released" : ""}><b>{depth}</b><span>{depth === 0 ? "Founders" : `Generation ${depth}`}</span><small>{depth <= (state?.policy.depth ?? 1) ? "Released" : "Vote required"}</small></div>)}</div><p className="caption">Invitations do not reserve places. Final admission checks the sponsor’s allocation and available capacity atomically. Unused places confer no rights.</p></section></div>
      <div className="home-grid"><section className="aqua-card"><p className="eyebrow">Make a connection</p><h3>Invite someone you know</h3><label htmlFor="recipient-key">Recipient’s public key</label><input id="recipient-key" value={recipient} onChange={e => setRecipient(e.target.value.trim())} placeholder="64-character public key" autoComplete="off" /><small>Bound to this key. Never paste a secret key.</small><button disabled={!member || invitationsAvailable(state!, member) < 1} onClick={() => action(() => { const command = submit({ kind: "invite", recipient, expires: now + 7 * 86400000, policy: state!.policy.version }); setInviteText(JSON.stringify(command)); setReviewed(null); })}>Create signed invitation</button>{demo && <p className="caption">Try it: invite “You” with the prefilled key, then switch the demo identity to “You” and review the invitation below.</p>}{!demo && <p>Final admission is unavailable until a trusted ordering service and private governance are configured. Explore the demo to try the complete flow.</p>}</section>
      <section className="aqua-card"><p className="eyebrow">An invitation to belong</p><h3>Review & join</h3><label htmlFor="invite-text">Signed invitation</label><textarea id="invite-text" value={inviteText} onChange={e => { setInviteText(e.target.value); setReviewed(null); }} placeholder="Paste an invitation here" /><div className="action-row"><button onClick={() => action(inspectInvite)}>Review invitation</button><button className="quiet" disabled={!inviteText} onClick={() => void copy(inviteText)}>Copy invitation</button></div>{reviewed && <div className="invite-preview"><strong>Invited by {sponsor?.name ?? short(reviewed.key)}</strong><p>{demo ? "Aqua Commons · local demo" : `Community ${reviewed.community} · authority unverified`}</p><p>{reviewed.body.kind === "invite" && `Expires ${new Date(reviewed.body.expires).toLocaleString()}`}</p><p>Your public sponsor relationship will be visible. This graph is pseudonymous, not anonymous.</p><label htmlFor="member-name">Chosen display name</label><input id="member-name" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={48} /><button onClick={() => action(acceptInvite)}>{demo ? "Accept invitation" : "Queue admission request"}</button></div>}{ownPending.length > 0 && !demo && <div className="notice"><b>Admission pending</b><p>Saved on this device. No final membership or entitlements. Reconnecting does not finalise this request.</p><button className="quiet" onClick={() => void copy(JSON.stringify(ownPending))}>Copy signed requests</button></div>}</section></div>
      <section className="aqua-card explorer"><div className="section-top"><div><p className="eyebrow">People, not a score</p><h3>Community explorer</h3></div><div className="action-row"><button className="quiet" onClick={() => setListMode(!listMode)}>{listMode ? "Branch view" : "Accessible list"}</button><button className="quiet" aria-label="Zoom out" onClick={() => setZoom(Math.max(.85, zoom - .1))}>−</button><button className="quiet" aria-label="Zoom in" onClick={() => setZoom(Math.min(1.4, zoom + .1))}>+</button></div></div><label htmlFor="member-search">Find a name or member ID</label><input id="member-search" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search your community" /><ul className="branch-list" style={{ fontSize: `${zoom}rem` }}>{rows.map(memberRow)}</ul>{!rows.length && <p className="empty-state">{demo ? "No members match your search." : "Your recognised community will appear here. Explore the demo to see its branches."}</p>}<div className="section-top"><small>{filtered.length} members · up to 30 rows rendered at once</small><div className="action-row"><button className="quiet" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button className="quiet" disabled={(page + 1) * 30 >= filtered.length} onClick={() => setPage(page + 1)}>Next</button></div></div><p className="caption">Public ancestry reveals relationships. No financial history or branch voting choices are shown.</p></section>
      <section className="aqua-card"><p className="eyebrow">Care, with context</p><h3>Observations & review</h3>{state ? <><p>{branchDiagnostics(state, now).observations.join(" ")}</p><p>{demo!.authority.admissionFailures.filter(f => f.time > now - 86400000).length} rejected admission attempts observed on this demo authority in the last 24 hours (up to the latest 100 retained). Failed attempts can be ordinary mistakes or stale invitations.</p><p className="caption">24-hour admission window. These observations are uncertain and do not prove fraud. Flags never change votes, membership or UBI.</p><label htmlFor="review-subject">Member to discuss</label><select id="review-subject" value={subject} onChange={e => setSubject(e.target.value)}><option value="">Choose a member</option>{active.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><label htmlFor="review-evidence">Observed facts / public evidence reference</label><textarea id="review-evidence" value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="Describe what happened and what is uncertain. Avoid private financial or personal information." /><button disabled={!member} onClick={() => action(() => { submit({ kind: "review", subject, evidence }); })}>Open non-punitive review</button><label htmlFor="review-response">Response, appeal or closing note</label><textarea id="review-response" value={response} onChange={e => setResponse(e.target.value)} />{Object.values(state.reviews).map(review => <article className="review-record" key={review.id}><b>{state.members[review.subject]?.name} · {review.decision ? "Observation closed" : "Open for response"}</b><p>{review.evidence}</p>{review.responses.map((r, i) => <p key={i}>{r.appeal ? "Appeal" : "Member response"}: {r.text}</p>)}{review.decision && <p>Closing note: {review.decision}</p>}{member?.id === review.subject && <div className="action-row"><button onClick={() => action(() => { submit({ kind: "response", review: review.id, text: response, appeal: false }); })}>Add response</button><button className="quiet" onClick={() => action(() => { submit({ kind: "response", review: review.id, text: response, appeal: true }); })}>Record appeal</button></div>}{member?.id === review.reporter && <button className="quiet" onClick={() => action(() => { submit({ kind: "resolve", review: review.id, text: response }); })}>Close observation without sanctions</button>}</article>)}</> : <p>No community observations yet. Reviews need evidence, a member response and an appeal route. Punitive enforcement is not implemented.</p>}</section>
    </>}

    {view === "decisions" && <>
      <header className="page-heading"><p className="eyebrow">One member. One ordinary vote.</p><h2>Decide what comes next.</h2><p>Grow only when the community is ready.</p></header><div className="notice">{demo ? "Public test voting: your signed choices are visible in the demo log. These votes authorise only simulated growth." : "BranchID growth votes require the isolated demo. The public alpha ballots above do not approve BranchID growth. Private voting and production governance are not implemented."}</div>
      <section className="aqua-card"><p className="eyebrow">Next growth gate</p><h3>{state && state.policy.depth === 3 ? "All generations released" : `Open generation ${(state?.policy.depth ?? 1) + 1}`}</h3><p>Seven days · 50% turnout, rounded up · strictly more yes than no. Abstentions count toward turnout. Eligible members are fixed when the proposal opens.</p><label htmlFor="growth-rationale">Why should the community expand?</label><textarea id="growth-rationale" value={rationale} onChange={e => setRationale(e.target.value)} /><button disabled={!member || state!.policy.depth >= 3} onClick={() => action(() => { submit({ kind: "propose", rationale, depth: state!.policy.depth + 1, capacity: state!.policy.depth === 1 ? 884 : 2500, policy: state!.policy.version }); })}>Propose the next tranche</button><p className="caption">Capacity is fairly divided among eligible sponsors at opening, capped at 10 each. Stable member-ID order breaks remainder ties. Unused allocations remain held; late sponsors wait for a future explicit policy.</p></section>
      {!proposals.length && <section className="aqua-card empty-state"><h3>No growth decisions yet</h3><p>Admit a member to the first generation in the demo, then propose the next stage.</p></section>}
      {proposals.map(proposal => { const votes = Object.values(proposal.votes); return <section className="aqua-card" key={proposal.id}><div className="section-top"><p className="eyebrow">Growth proposal · policy {proposal.policy}</p><span className="status-chip">{proposal.result}</span></div><h3>Generation {proposal.depth} · {proposal.capacity.toLocaleString()} places</h3><p>{proposal.rationale}</p><p>{votes.length} / {proposal.snapshot.length} eligible members participated · quorum {Math.ceil(proposal.snapshot.length / 2)}</p><progress aria-label="Voter turnout" value={votes.length} max={proposal.snapshot.length} /><p>Closes {new Date(proposal.closes).toLocaleString()} (demo authority clock)</p>{proposal.result === "open" ? <><label className="check-label"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I consent to a public, signed test vote.</label><div className="action-row">{(["yes", "no", "abstain"] as const).map(choice => <button disabled={!consent || !member || !proposal.snapshot.includes(member.id) || !!proposal.votes[member.id]} key={choice} onClick={() => action(() => { submit({ kind: "ballot", proposal: proposal.id, choice, publicConsent: true }); })}>{choice === "yes" ? "Support" : choice === "no" ? "Oppose" : "Abstain"}</button>)}</div><button className="quiet" onClick={() => action(() => { if (!demo) return; demo.time = Math.max(demo.time, proposal.closes); submit({ kind: "close", proposal: proposal.id }); })}>Advance demo clock to closing & evaluate</button></> : <p>{proposal.result === "approved" ? "A signed demo authorisation released this tranche." : "Gate remains closed. Existing rights are unchanged."}</p>}<p className="caption">Only community-wide turnout is displayed. Small-cohort and branch-choice breakdowns are suppressed.</p></section>; })}
      {demo && <details className="aqua-card"><summary>Verifiable demonstration history</summary><p>Authority receipts include order, prior receipt hash, signed requests and state commitments. They prove this demo’s order, not decentralised consensus.</p><button className="quiet" onClick={() => void copy(JSON.stringify(demo.authority.archive))}>Copy public signed history</button></details>}
    </>}
  </div>;
}
