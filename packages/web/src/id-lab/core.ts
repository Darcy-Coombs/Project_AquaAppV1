// Local experimental substrate. These values are not proof of unique personhood.
export const SCOPES = ["Voting", "Chaos Chat", "DEX"] as const;
export const ACTION = "demo-election-001";
export type CeremonyResult = { version: "aqua-presence:v1"; challengeId: string; completedAt: string; passed: true };
export type Authentication = { credentialId: string; publicKeySpki: string; algorithm: "ES256"; rpId: string; origin: string; userHandle: string };
export type LabIdentity = {
  id: "root";
  rootKey: CryptoKey;
  createdAt: string;
  epoch: number;
  authentication: Authentication;
  records: { epoch: number; challenge: CeremonyResult }[];
};

export function randomBytes(size = 32): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(size));
}
export function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
export function generateRoot(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]);
}
async function derive(root: CryptoKey, domain: string, fields: unknown[]): Promise<string> {
  // Structured tuples prevent ambiguous scope/epoch concatenations.
  return hex(await crypto.subtle.sign("HMAC", root, new TextEncoder().encode(domain + JSON.stringify(fields))));
}
export function scopedId(root: CryptoKey, scope: string, epoch: number): Promise<string> {
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw new Error("Invalid renewal epoch");
  return derive(root, "aqua-scope-id:v1:", [scope, epoch]).then(value => `aq_${value}`);
}
export function nullifier(root: CryptoKey, action: string): Promise<string> {
  // Deliberately excludes renewal epoch: rotation must not allow another vote.
  return derive(root, "aqua-nullifier:v1:", [action]);
}
export function renew(identity: LabIdentity, challenge: CeremonyResult): LabIdentity {
  if (!challenge.passed || identity.records.some(record => record.challenge.challengeId === challenge.challengeId)) {
    throw new Error("Renewal requires a fresh completed challenge");
  }
  const epoch = identity.epoch + 1;
  if (!Number.isSafeInteger(epoch)) throw new Error("Renewal counter exhausted");
  return { ...identity, epoch, records: [...identity.records, { epoch, challenge }] };
}
export function publicRecord(identity: LabIdentity) {
  // Explicit allowlist. Never spread the storage object into a display/export.
  const auth = identity.authentication;
  return {
    createdAt: identity.createdAt, epoch: identity.epoch,
    authentication: {
      credentialId: auth.credentialId, publicKeySpki: auth.publicKeySpki, algorithm: auth.algorithm,
      rpId: auth.rpId, origin: auth.origin, userHandle: auth.userHandle
    },
    records: identity.records.map(({ epoch, challenge }) => ({ epoch, challenge: {
      version: challenge.version, challengeId: challenge.challengeId, completedAt: challenge.completedAt, passed: challenge.passed
    } }))
  };
}
