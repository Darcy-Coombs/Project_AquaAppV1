import { canonicalJson } from './canonical-json.ts';
import { sha256Hex } from './crypto.ts';
import { BASE_PROTOCOL, MODULE_VERSION } from './constants.ts';

export function protocolHash(modules: Record<string, string> = {}): string {
  return sha256Hex(canonicalJson({
    base: BASE_PROTOCOL,
    modules: {
      identity: MODULE_VERSION,
      money: MODULE_VERSION,
      governance: MODULE_VERSION,
      dex: MODULE_VERSION,
      gossip: MODULE_VERSION,
      ...modules
    }
  }));
}
