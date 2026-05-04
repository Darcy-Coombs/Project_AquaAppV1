import { createHash, generateKeyPairSync, createPrivateKey, createPublicKey, sign as nodeSign, verify as nodeVerify } from 'node:crypto';

export type KeyPair = {
  publicKey: string;
  privateKey: string;
};

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function generateIdentityKeypair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')
  };
}

export function signText(privateKeyBase64: string, text: string): string {
  const key = createPrivateKey({ key: Buffer.from(privateKeyBase64, 'base64'), type: 'pkcs8', format: 'der' });
  return nodeSign(null, Buffer.from(text), key).toString('base64');
}

export function verifyText(publicKeyBase64: string, text: string, signatureBase64: string): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeyBase64, 'base64'), type: 'spki', format: 'der' });
    return nodeVerify(null, Buffer.from(text), key, Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
}
