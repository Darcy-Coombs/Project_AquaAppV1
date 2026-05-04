import { createPohwAttest, type PohwStatus } from './identity.ts';
import { type KeyPair } from '../protocol/crypto.ts';

export function createPohwPlaceholder(keypair: KeyPair, subject: string, status: PohwStatus = 'unverified') {
  return createPohwAttest(keypair, subject, status);
}
