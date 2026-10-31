import { describe, expect, it } from "vitest";
import { generateRoot, nullifier, publicRecord, renew, scopedId, type LabIdentity, type CeremonyResult } from "../../packages/web/src/id-lab/core.js";
import { base64url, derToRaw, validateAssertion } from "../../packages/web/src/id-lab/webauthn.js";

const challenge = (id: string): CeremonyResult => ({ version: "aqua-presence:v1", challengeId: id, completedAt: "2026-09-27T00:00:00.000Z", passed: true });
async function fixture(): Promise<LabIdentity> {
  return { id: "root", rootKey: await generateRoot(), createdAt: "2026-09-27T00:00:00.000Z", epoch: 0,
    authentication: { credentialId: "credential", publicKeySpki: "public", algorithm: "ES256", origin: "https://aqua.test", rpId: "aqua.test", userHandle: "random" },
    records: [{ epoch: 0, challenge: challenge("first") }] };
}
describe("Aqua ID Lab domain separation and continuity", () => {
  it("same root and scope are deterministic; three scopes differ", async () => {
    const root = await generateRoot();
    expect(await scopedId(root, "Voting", 0)).toBe(await scopedId(root, "Voting", 0));
    expect(new Set(await Promise.all(["Voting", "Chaos Chat", "DEX"].map(scope => scopedId(root, scope, 0)))).size).toBe(3);
  });
  it("action nullifiers are deterministic and action-specific", async () => {
    const root = await generateRoot();
    expect(await nullifier(root, "election-1")).toBe(await nullifier(root, "election-1"));
    expect(await nullifier(root, "election-1")).not.toBe(await nullifier(root, "election-2"));
  });
  it("pseudonyms and nullifiers use separate domains even with identical scope strings", async () => {
    const root = await generateRoot();
    expect((await scopedId(root, "same", 0)).slice(3)).not.toBe(await nullifier(root, "same"));
  });
  it("different roots produce different pseudonyms and nullifiers", async () => {
    const a = await generateRoot(), b = await generateRoot();
    expect(await scopedId(a, "Voting", 0)).not.toBe(await scopedId(b, "Voting", 0));
    expect(await nullifier(a, "event")).not.toBe(await nullifier(b, "event"));
  });
  it("rotates scoped identities without replacing root, credential, or action nullifier", async () => {
    const initial = await fixture();
    const next = renew(initial, challenge("second"));
    expect(initial.epoch).toBe(0);
    expect(next.epoch).toBe(1);
    expect(next.rootKey).toBe(initial.rootKey);
    expect(next.authentication).toBe(initial.authentication);
    expect(next.records).toEqual([...initial.records, { epoch: 1, challenge: challenge("second") }]);
    expect(await scopedId(next.rootKey, "Voting", next.epoch)).not.toBe(await scopedId(initial.rootKey, "Voting", initial.epoch));
    expect(await nullifier(next.rootKey, "event")).toBe(await nullifier(initial.rootKey, "event"));
    expect(() => renew(next, challenge("second"))).toThrow(/fresh/);
    expect(() => renew(next, { ...challenge("third"), passed: false } as unknown as CeremonyResult)).toThrow(/fresh/);
    expect(() => scopedId(next.rootKey, "Voting", -1)).toThrow(/epoch/);
  });
  it("uses structured tuples and a fixed known HMAC vector", async () => {
    const root = await crypto.subtle.importKey("raw", new Uint8Array(32).fill(42), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const { createHmac } = await import("node:crypto");
    const expected = createHmac("sha256", Buffer.alloc(32, 42)).update('aqua-scope-id:v1:["Voting",0]').digest("hex");
    expect(await scopedId(root, "Voting", 0)).toBe(`aq_${expected}`);
    expect(await scopedId(root, "Voting:1", 0)).not.toBe(await scopedId(root, "Voting", 1));
  });
  it("root keys cannot be exported; explicit public allowlist excludes even injected secrets", async () => {
    const identity = await fixture();
    expect(identity.rootKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", identity.rootKey)).rejects.toThrow();
    Object.assign(identity, { secret: "SECRET_SENTINEL" });
    Object.assign(identity.authentication, { privateKey: "SECRET_SENTINEL" });
    Object.assign(identity.records[0]!.challenge, { rawTrace: "SECRET_SENTINEL" });
    const json = JSON.stringify(publicRecord(identity));
    expect(json).not.toMatch(/SECRET_SENTINEL|rootKey|privateKey|rawTrace/);
    expect(JSON.parse(json).authentication.publicKeySpki).toBe("public");
  });
});

// Generate an actual signed assertion; failures below must fail verification,
// not merely test a mocked navigator.credentials return value.
async function assertionFixture() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
  const rawId = new Uint8Array([1, 2, 3]).buffer;
  const auth = { ...(await fixture()).authentication, credentialId: base64url(rawId), userHandle: base64url(new Uint8Array([4])), publicKeySpki: base64url(await crypto.subtle.exportKey("spki", pair.publicKey)) };
  const client = { type: "webauthn.get", challenge: base64url(challengeBytes), origin: auth.origin, crossOrigin: false };
  const clientDataJSON = new TextEncoder().encode(JSON.stringify(client)).buffer;
  const authenticatorData = new Uint8Array(37);
  authenticatorData.set(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(auth.rpId))));
  authenticatorData[32] = 5;
  const signed = new Uint8Array(69);
  signed.set(authenticatorData);
  signed.set(new Uint8Array(await crypto.subtle.digest("SHA-256", clientDataJSON)), 37);
  const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, signed));
  const integers = [raw.slice(0, 32), raw.slice(32)].map(part => {
    while (part.length > 1 && part[0] === 0) part = part.slice(1);
    const positive = part[0]! >= 128 ? new Uint8Array([0, ...part]) : part;
    return [2, positive.length, ...positive];
  }).flat();
  const signature = new Uint8Array([0x30, integers.length, ...integers]).buffer;
  const response = { clientDataJSON, authenticatorData: authenticatorData.buffer, signature, userHandle: new Uint8Array([4]).buffer };
  return { auth, challengeBytes, client, response, credential: { rawId, response } as unknown as PublicKeyCredential };
}
describe("WebAuthn assertion verification", () => {
  it("accepts a valid signed assertion", async () => {
    const f = await assertionFixture();
    await expect(validateAssertion(f.auth, f.credential, f.challengeBytes)).resolves.toBeUndefined();
  });
  it.each(["challenge", "origin", "type", "crossOrigin", "rpHash", "presence", "verification", "signature", "credential", "userHandle"])("rejects mismatched %s", async field => {
    const f = await assertionFixture();
    if (field === "challenge") f.client.challenge = "wrong";
    if (field === "origin") f.client.origin = "https://evil.test";
    if (field === "type") f.client.type = "webauthn.create";
    if (field === "crossOrigin") f.client.crossOrigin = true;
    f.response.clientDataJSON = new TextEncoder().encode(JSON.stringify(f.client)).buffer;
    const data = new Uint8Array(f.response.authenticatorData);
    if (field === "rpHash") data[0] = data[0]! ^ 1;
    if (field === "presence") data[32] = 4;
    if (field === "verification") data[32] = 1;
    if (field === "signature") { const sig = new Uint8Array(f.response.signature); sig[sig.length - 1] = sig[sig.length - 1]! ^ 1; }
    if (field === "credential") f.auth.credentialId = "wrong";
    if (field === "userHandle") f.auth.userHandle = "wrong";
    await expect(validateAssertion(f.auth, f.credential, f.challengeBytes)).rejects.toThrow();
  });
  it("rejects malformed DER", () => {
    for (const value of [[], [0x30, 0], [0x30, 3, 2, 1, 0], [0x30, 6, 2, 1, 128, 2, 1, 1]]) {
      expect(() => derToRaw(new Uint8Array(value).buffer)).toThrow();
    }
  });
});
