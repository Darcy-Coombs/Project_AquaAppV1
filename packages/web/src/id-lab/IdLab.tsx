import React, { useEffect, useRef, useState } from "react";
import { ACTION, SCOPES, generateRoot, nullifier, publicRecord, scopedId, type CeremonyResult, type LabIdentity } from "./core.js";
import { consumeNullifier, labDb, saveNew, saveRenewal, type UsedNullifier } from "./storage.js";
import { enrol, environmentIssue, verifyControl } from "./webauthn.js";
import { PresenceChallenge } from "./PresenceChallenge.js";
import "./id-lab.css";

export function IdLab() {
  const [identity, setIdentity] = useState<LabIdentity>();
  const [pending, setPending] = useState<{ kind: "create" | "renew"; identity: LabIdentity }>();
  const [scopes, setScopes] = useState<Record<string, string>>({});
  const [actionNullifier, setActionNullifier] = useState("");
  const [used, setUsed] = useState<UsedNullifier[]>([]);
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [inspector, setInspector] = useState(false);
  const lock = useRef(false);
  const issue = environmentIssue();

  async function refresh() {
    const current = await labDb.identities.get("root");
    setIdentity(current);
    setUsed(await labDb.used.toArray());
    if (current) {
      const pairs = await Promise.all(SCOPES.map(async scope => [scope, await scopedId(current.rootKey, scope, current.epoch)] as const));
      setScopes(Object.fromEntries(pairs));
      setActionNullifier(await nullifier(current.rootKey, ACTION));
    } else { setScopes({}); setActionNullifier(""); }
    return current;
  }
  useEffect(() => {
    if (issue) { setBusy(false); return; }
    void refresh().catch(() => setError("Cannot read the lab's IndexedDB storage. Allow site storage, then reload. No in-memory identity fallback is used.")).finally(() => setBusy(false));
  }, []);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setStatus("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Operation failed. Try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function create() {
    if (await refresh()) throw new Error("An identity already exists in this browser. Use Verify Control or Renew.");
    const authentication = await enrol();
    const rootKey = await generateRoot();
    setPending({ kind: "create", identity: { id: "root", rootKey, authentication, createdAt: new Date().toISOString(), epoch: 0, records: [] } });
  }
  async function control(renewing: boolean) {
    const current = await refresh();
    if (!current) throw new Error("No local identity remains. Browser storage may have been cleared; enrol a new identity.");
    await verifyControl(current.authentication);
    if (renewing) setPending({ kind: "renew", identity: current });
    else setStatus("CONTROL VERIFIED — fresh WebAuthn signature checked locally. This is not proof of unique personhood.");
  }
  async function complete(challenge: CeremonyResult) {
    if (!pending) return;
    if (pending.kind === "create") await saveNew({ ...pending.identity, records: [{ epoch: 0, challenge }] });
    else await saveRenewal(pending.identity, challenge);
    const kind = pending.kind;
    setPending(undefined);
    await refresh();
    setStatus(kind === "create" ? "Aqua ID Created — No personal information supplied" : "Aqua ID renewed — scoped pseudonyms rotated; root, passkey and event nullifier retained.");
  }
  return <section className="panel id-lab">
    <div className="section-heading"><p className="eyebrow">Isolated experiment · v0.1</p><h2>AQUA ID LAB</h2></div>
    <aside className="lab-warning"><h3>CURRENT LIMITATION</h3>
      <p>Aqua ID v0.1 does not prove that one human can possess only one Aqua identity.</p>
      <p>A participant can currently use another device/profile/browser and enrol another root.</p>
      <p>This prototype tests anonymous continuity, scoped pseudonyms, nullifiers and renewal. Future Aqua versions will investigate decentralised Sybil resistance using multiple independent forms of evidence over time.</p>
    </aside>
    <p>This lab uses no Aqua email identity, relay, analytics, AI, or identity provider. It sends no lab identity records to a server. The existing app's other features have separate data and network behaviour.</p>
    {issue && <p className="lab-warning" role="alert">{issue}</p>}
    {error && <p className="lab-warning" role="alert">{error} Cancelling a passkey prompt leaves an existing Aqua identity unchanged.</p>}
    <p role="status" data-testid="lab-status">{busy ? "Working… complete any browser passkey prompt." : status}</p>
    {!identity && !pending && <div className="lab-card"><h3>Create a private root</h3>
      <p>Aqua creates a random, non-extractable root key and a separate passkey. Your authenticator handles its own unlock method; Aqua receives no biometric data. You may be prompted twice to create and verify the passkey.</p>
      <button disabled={busy || !!issue} onClick={() => void run(create)}>CREATE AQUA ID</button>
    </div>}
    {pending && <PresenceChallenge onComplete={complete} onCancel={() => { setPending(undefined); setStatus("Challenge cancelled. No identity or renewal was saved. A newly created passkey may remain in your authenticator; remove it there if unwanted."); }} />}
    {identity && <>
      <div className="lab-card"><h3>Scoped Identities</h3><p data-testid="lab-epoch">Renewal epoch: {identity.epoch}</p>
        <p>These three values are derived locally from the same private root with different scope inputs. The root is never published. This view demonstrates derivation, not a public zero-knowledge proof.</p>
        <div className="metric-grid">{SCOPES.map(scope => <article className="metric-card" key={scope}><span>{scope}</span><strong data-testid={`scope-${scope}`}>{scopes[scope]?.slice(0, 19)}…</strong></article>)}</div>
        <p>Full 256-bit values appear in the inspector. Sharing this combined screen links these identities. Separate values alone do not directly disclose the shared root; network and usage metadata may still link activity.</p>
      </div>
      <div className="lab-card"><h3>Nullifier Demo</h3><p>Event: <code>{ACTION}</code></p>
        <p>LOCAL SIMULATION ONLY: an atomic IndexedDB set simulates a future replicated/decentralised Aqua network check. Clearing or editing local storage defeats it.</p>
        <button disabled={busy || !!pending || !!issue} onClick={() => void run(async () => {
          const accepted = await consumeNullifier(identity, actionNullifier, ACTION);
          setUsed(await labDb.used.toArray());
          setStatus(accepted ? "ACCEPTED" : "REJECTED — NULLIFIER ALREADY USED — ALREADY PARTICIPATED");
        })}>CAST TEST VOTE</button>
      </div>
      <div className="action-row">
        <button disabled={busy || !!pending || !!issue} onClick={() => void run(() => control(false))}>VERIFY CONTROL</button>
        <button disabled={busy || !!pending || !!issue} onClick={() => void run(() => control(true))}>RENEW AQUA ID</button>
      </div>
      <p>Renewal requires the existing passkey and a fresh interaction challenge. It advances the epoch and rotates pseudonyms, preserving root continuity and the event nullifier. The authentication passkey is retained in v0.1.</p>
    </>}
    <button className="ghost-button" aria-expanded={inspector} onClick={() => setInspector(!inspector)}>WHAT DOES AQUA KNOW?</button>
    {inspector && <section className="lab-card" aria-label="Privacy Inspector"><h3>WHAT DOES AQUA KNOW?</h3>
      <p>This inventory covers Aqua ID Lab only, not the existing email identity or other Aqua features.</p>
      <ul>{["Name", "Email", "Phone", "Government ID", "Location history", "Raw behavioural trace", "Contacts", "Date of birth", "Home address", "GPS coordinates", "Photographs", "Biometrics", "Advertising/device fingerprint"].map(label => <li key={label}>{label}: NONE</li>)}</ul>
      <p><strong>Secret storage:</strong> IndexedDB database <code>aqua-id-lab-v01</code>, identities row <code>root</code>: one non-extractable HMAC-SHA-256 CryptoKey. Key bytes are never displayed or exported. The authenticator separately holds the passkey private key; the browser/OS provider may sync that passkey according to its settings. The Aqua root is not synced or recoverable from the passkey.</p>
      <p><strong>Stored non-secret records:</strong> creation time, epoch, credential ID, ES256 public key, RP hostname, origin, random user handle, enrolment/renewal results; plus the used-nullifier table below. Credential metadata and timestamps can correlate activity if disclosed.</p>
      <p><strong>Memory only:</strong> pending root/credential during enrolment, random WebAuthn challenges and assertions, ceremony round/target/wait state, verification status and derived pseudonyms/nullifier. Cancel/reload discards an unfinished ceremony; no raw behavioural trace is persisted.</p>
      <p><strong>Transmissions:</strong> no lab records sent to an Aqua server. WebAuthn passes the RP hostname/name, anonymous account label and random user handle at registration, random challenges, and credential ID at authentication to your browser/authenticator. Public key/assertion responses return locally. Attestation is “none”; no hardware identifier is retained. A future action verifier would receive the action scope and nullifier; a context would receive only its scoped pseudonym, never this combined inventory.</p>
      <p><strong>Limits:</strong> non-extractable does not mean protected from malicious same-origin scripts, extensions or device compromise. WebAuthn checks gate this UI; they do not encrypt or hardware-bind the root. Browser storage deletion loses continuity and resets this local demo; a saved passkey alone cannot recover it.</p>
      <pre data-testid="lab-records">{JSON.stringify({ identity: identity ? publicRecord(identity) : null, derivedInMemory: { scopedPseudonyms: scopes, action: ACTION, nullifier: actionNullifier || null }, usedNullifiers: used }, null, 2)}</pre>
    </section>}
  </section>;
}
