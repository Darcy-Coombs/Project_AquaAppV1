import { createEvent } from '../protocol/event.ts';
import { type KeyPair } from '../protocol/crypto.ts';

export function setProxy(keypair: KeyPair, proxy: string) {
  return createEvent({
    module: 'governance',
    type: 'governance.proxy_set',
    keypair,
    payload: { proxy }
  });
}

export function revokeProxy(keypair: KeyPair) {
  return createEvent({
    module: 'governance',
    type: 'governance.proxy_revoke',
    keypair,
    payload: {}
  });
}
