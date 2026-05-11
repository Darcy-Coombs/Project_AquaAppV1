export const BASE_PROTOCOL = 'aqua.base.v0.1';
export const MODULE_VERSION = 'v0.1';

export function createEvent(type, payload = {}, author = '', parents = []) {
  return normalizeEvent({
    protocol: BASE_PROTOCOL,
    module: String(type).split('.')[0] || 'system',
    moduleVersion: MODULE_VERSION,
    type,
    createdAt: Date.now(),
    author,
    parents,
    payload
  });
}

export async function hashEvent(event) {
  return sha256Hex(canonicalJson(signingBody(normalizeEvent(event))));
}

export async function signEvent(event, privateKeyBase64) {
  const normalized = normalizeEvent(event);
  const privateKey = await crypto.subtle.importKey('pkcs8', base64ToArrayBuffer(privateKeyBase64), { name: 'Ed25519' }, false, ['sign']);
  const id = await hashEvent(normalized);
  const signature = arrayBufferToBase64(await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, textBytes(canonicalJson(signingBody(normalized)))));
  return { ...normalized, id, signature };
}

export async function verifyEventHash(event) {
  if (!event?.id) return false;
  return event.id === await hashEvent(event);
}

export async function verifyEventSignature(event, publicKeyBase64 = event?.author) {
  try {
    if (!event?.signature || !publicKeyBase64) return false;
    const publicKey = await crypto.subtle.importKey('spki', base64ToArrayBuffer(publicKeyBase64), { name: 'Ed25519' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'Ed25519' }, publicKey, base64ToArrayBuffer(event.signature), textBytes(canonicalJson(signingBody(normalizeEvent(event)))));
  } catch {
    return false;
  }
}

export function normalizeEvent(event) {
  const type = String(event?.type ?? 'system.unknown');
  return {
    protocol: event?.protocol ?? BASE_PROTOCOL,
    module: event?.module ?? type.split('.')[0] ?? 'system',
    moduleVersion: event?.moduleVersion ?? MODULE_VERSION,
    type,
    createdAt: Number(event?.createdAt ?? Date.now()),
    author: String(event?.author ?? ''),
    parents: Array.isArray(event?.parents) ? event.parents.map(String).slice(0, 2) : [],
    payload: event?.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? sortValue(event.payload) : {},
    ...(event?.id ? { id: String(event.id) } : {}),
    ...(event?.signature ? { signature: String(event.signature) } : {})
  };
}

export function signingBody(event) {
  const normalized = normalizeEvent(event);
  return {
    protocol: normalized.protocol,
    module: normalized.module,
    moduleVersion: normalized.moduleVersion,
    type: normalized.type,
    createdAt: normalized.createdAt,
    author: normalized.author,
    parents: normalized.parents,
    payload: normalized.payload
  };
}

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

export function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = sortValue(value[key]);
    }
    return out;
  }
  return value;
}

export async function sha256Hex(value) {
  const bytes = typeof value === 'string' ? textBytes(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function generateIdentityKeypair() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  return {
    publicKey: arrayBufferToBase64(await crypto.subtle.exportKey('spki', pair.publicKey)),
    privateKey: arrayBufferToBase64(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  };
}

export function textBytes(text) {
  return new TextEncoder().encode(String(text));
}

export function arrayBufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

export function base64ToArrayBuffer(value) {
  const text = atob(value);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes.buffer;
}
