import { hex, randomBytes, type Authentication } from "./core.js";

export function base64url(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes instanceof Uint8Array ? bytes : bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}
export function environmentIssue(): string | null {
  if (!isSecureContext || !["http:", "https:"].includes(location.protocol)) {
    return "WebAuthn needs HTTPS or localhost. Plain LAN HTTP and downloaded file pages cannot enrol here. On Android use Chrome USB port forwarding to localhost:5173, or serve this app over trusted HTTPS.";
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(location.hostname) || location.hostname.includes(":")) {
    return "WebAuthn relying-party IDs need a hostname, not an IP address. For this computer open http://localhost:5173 (use the current port if different). On Android forward localhost:5173 over USB, or use a trusted HTTPS hostname.";
  }
  if (!crypto.subtle || !globalThis.PublicKeyCredential || !navigator.credentials) return "This browser lacks Web Crypto or WebAuthn. Use a current browser with a passkey authenticator.";
  if (!globalThis.indexedDB) return "IndexedDB is unavailable. Allow browser storage to use this lab.";
  return null;
}
function validateClient(data: ArrayBuffer, challenge: Uint8Array, type: string, origin: string) {
  const client = JSON.parse(new TextDecoder().decode(data));
  if (client.type !== type || client.challenge !== base64url(challenge) || client.origin !== origin || client.crossOrigin === true) {
    throw new Error("WebAuthn challenge or origin mismatch");
  }
}
// Encoding conversion only: WebAuthn ES256 uses DER; Web Crypto uses r || s.
export function derToRaw(signature: ArrayBuffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(signature);
  if (bytes[0] !== 0x30 || bytes[1] !== bytes.length - 2) throw new Error("Invalid ES256 signature");
  let offset = 2;
  const result = new Uint8Array(64);
  for (let part = 0; part < 2; part++) {
    if (bytes[offset++] !== 2) throw new Error("Invalid ES256 integer");
    const length = bytes[offset++];
    if (!length || length > 33 || offset + length > bytes.length) throw new Error("Invalid ES256 length");
    let integer = bytes.slice(offset, offset + length);
    offset += length;
    if ((integer[0]! & 0x80) !== 0) throw new Error("Negative ES256 integer");
    if (integer.length > 1 && integer[0] === 0) {
      if ((integer[1]! & 0x80) === 0) throw new Error("Noncanonical ES256 integer");
      integer = integer.slice(1);
    }
    if (integer.length > 32) throw new Error("Oversized ES256 integer");
    result.set(integer, part * 32 + 32 - integer.length);
  }
  if (offset !== bytes.length) throw new Error("Trailing ES256 data");
  return result;
}
export async function enrol(): Promise<Authentication> {
  const issue = environmentIssue();
  if (issue) throw new Error(issue);
  const challenge = randomBytes();
  const user = randomBytes();
  const credential = await navigator.credentials.create({ publicKey: {
    challenge, rp: { name: "Aqua ID Lab", id: location.hostname },
    user: { id: user, name: `aqua-${hex(user).slice(0, 12)}`, displayName: "Anonymous Aqua ID" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    attestation: "none", timeout: 60000
  } }) as PublicKeyCredential | null;
  if (!credential) throw new Error("Credential creation cancelled");
  const response = credential.response as AuthenticatorAttestationResponse;
  validateClient(response.clientDataJSON, challenge, "webauthn.create", location.origin);
  const publicKey = response.getPublicKey?.();
  if (!publicKey || response.getPublicKeyAlgorithm() !== -7) throw new Error("This browser must support ES256 and WebAuthn getPublicKey. Try current Chrome.");
  const auth: Authentication = {
    credentialId: base64url(credential.rawId), publicKeySpki: base64url(publicKey), algorithm: "ES256",
    rpId: location.hostname, origin: location.origin, userHandle: base64url(user)
  };
  // Prove the new credential can sign before persisting an Aqua root. Attestation
  // provenance is deliberately not used as evidence about a person or device.
  await verifyControl(auth);
  return auth;
}
export async function validateAssertion(auth: Authentication, credential: PublicKeyCredential, challenge: Uint8Array): Promise<void> {
  if (base64url(credential.rawId) !== auth.credentialId) throw new Error("Wrong authentication credential");
  const response = credential.response as AuthenticatorAssertionResponse;
  validateClient(response.clientDataJSON, challenge, "webauthn.get", auth.origin);
  if (response.userHandle && base64url(response.userHandle) !== auth.userHandle) throw new Error("Wrong credential user handle");
  const data = new Uint8Array(response.authenticatorData);
  const rpHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(auth.rpId));
  if (data.length < 37 || hex(data.slice(0, 32)) !== hex(rpHash) || (data[32]! & 5) !== 5) {
    throw new Error("WebAuthn relying party, user presence or user verification failed");
  }
  const hash = await crypto.subtle.digest("SHA-256", response.clientDataJSON);
  const signed = new Uint8Array(data.length + 32);
  signed.set(data); signed.set(new Uint8Array(hash), data.length);
  const key = await crypto.subtle.importKey("spki", decode(auth.publicKeySpki), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  if (!await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derToRaw(response.signature), signed)) {
    throw new Error("WebAuthn signature verification failed");
  }
}
export async function verifyControl(auth: Authentication): Promise<void> {
  if (location.origin !== auth.origin || location.hostname !== auth.rpId) throw new Error("Return to the original Aqua ID origin");
  const challenge = randomBytes();
  const credential = await navigator.credentials.get({ publicKey: {
    challenge, rpId: auth.rpId, allowCredentials: [{ type: "public-key", id: decode(auth.credentialId) }],
    userVerification: "required", timeout: 60000
  } }) as PublicKeyCredential | null;
  if (!credential) throw new Error("Control verification cancelled");
  await validateAssertion(auth, credential, challenge);
  // Challenges/assertions stay in memory only. No counter-based clone/person claim:
  // synced passkeys may legitimately report zero or non-monotonic counters.
}
