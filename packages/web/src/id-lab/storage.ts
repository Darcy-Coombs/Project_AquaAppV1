import Dexie, { type Table } from "dexie";
import { renew, type LabIdentity, type CeremonyResult } from "./core.js";

export type UsedNullifier = { nullifier: string; action: string; acceptedAt: string };
class LabDatabase extends Dexie {
  identities!: Table<LabIdentity, string>;
  used!: Table<UsedNullifier, string>;
  constructor() {
    // Isolated from the Aqua protocol event queue and all public bundle exports.
    super("aqua-id-lab-v01");
    this.version(1).stores({ identities: "id", used: "nullifier" });
  }
}
export const labDb = new LabDatabase();
export async function saveNew(identity: LabIdentity) {
  // add, not put: concurrent tabs cannot overwrite an existing root.
  await labDb.identities.add(identity);
}
export async function saveRenewal(expected: LabIdentity, challenge: CeremonyResult) {
  return labDb.transaction("rw", labDb.identities, async () => {
    const current = await labDb.identities.get("root");
    if (!current || current.createdAt !== expected.createdAt || current.authentication.credentialId !== expected.authentication.credentialId || current.epoch !== expected.epoch) {
      throw new Error("Local identity changed or was deleted. Reload the lab and verify again.");
    }
    const next = renew(current, challenge);
    await labDb.identities.put(next);
    return next;
  });
}
export async function consumeNullifier(expected: LabIdentity, value: string, action: string): Promise<boolean> {
  // Atomic local simulation only. This is not a replicated network check.
  return labDb.transaction("rw", labDb.identities, labDb.used, async () => {
    const current = await labDb.identities.get("root");
    if (!current || current.authentication.credentialId !== expected.authentication.credentialId) throw new Error("Local identity was deleted or replaced. Reload the lab.");
    if (await labDb.used.get(value)) return false;
    await labDb.used.add({ nullifier: value, action, acceptedAt: new Date().toISOString() });
    return true;
  });
}
