import React, { useState } from "react";
import { createKeyPair, validateEnvelope, type AquaEvent } from "@aqua/protocol";
import { db, type StoredKey } from "./storage.js";

const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(""));
const decode = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0));
async function encryptionKey(password: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export function KeyBackup({ onRestore }: { onRestore: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function backup() {
    setBusy(true);
    try {
      if (password.length < 12) throw new Error("Use a backup passphrase of at least 12 characters.");
      const snapshot = async () => ({ version: 1, keys: await db.keys.toArray(), events: await db.events.toArray(), queue: await db.queue.toArray(), branchPending: localStorage.getItem("aqua-branchid-pending-v1") });
      const payload = "transaction" in db ? await db.transaction("r", [db.keys, db.events, db.queue], snapshot) : await snapshot();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(password, salt), new TextEncoder().encode(JSON.stringify(payload)));
      const blob = new Blob([JSON.stringify({ format: "aqua-encrypted-backup-v1", salt: encode(salt), iv: encode(iv), data: encode(new Uint8Array(encrypted)) })], { type: "application/json" });
      const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "aqua-encrypted-backup.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      setStatus("Encrypted backup downloaded. Keep it and your passphrase separately; both are needed to restore.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Backup failed"); }
    finally { setBusy(false); }
  }
  async function restore(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      if ((await db.keys.count()) || (await db.events.count())) throw new Error("Restore into an empty browser profile. Existing identities and wallets will not be overwritten.");
      if (file.size > 20 * 1024 * 1024) throw new Error("Backup is too large (20 MB maximum).");
      const box = JSON.parse(await file.text());
      if (box.format !== "aqua-encrypted-backup-v1") throw new Error("Unsupported backup format");
      const decoded = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(box.iv) }, await encryptionKey(password, decode(box.salt)), decode(box.data));
      const payload = JSON.parse(new TextDecoder().decode(decoded)) as { version: number; keys: StoredKey[]; events: AquaEvent[]; queue: AquaEvent[]; branchPending: string | null };
      if (payload.version !== 1 || !Array.isArray(payload.keys) || !Array.isArray(payload.events) || !Array.isArray(payload.queue)) throw new Error("Invalid backup contents");
      for (const key of payload.keys) if (!key.id || !key.userId || createKeyPair(key.privateKey).publicKey !== key.publicKey) throw new Error("Backup key validation failed");
      [...payload.events, ...payload.queue].forEach(validateEnvelope);
      const write = async () => {
        if ((await db.keys.count()) || (await db.events.count())) throw new Error("This profile changed while decrypting. Restore into an empty profile.");
        for (const event of payload.events) await db.events.put(event);
        for (const event of payload.queue) await db.queue.put(event);
        for (const key of payload.keys) await db.keys.put(key);
      };
      if ("transaction" in db) await db.transaction("rw", [db.keys, db.events, db.queue], write); else await write();
      if (payload.branchPending) localStorage.setItem("aqua-branchid-pending-v1", payload.branchPending);
      await onRestore(); setStatus("Keys, wallet events and queue restored. Reload to refresh pending BranchID requests.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Restore failed. Check the passphrase and file."); }
    finally { setBusy(false); }
  }
  return <details className="key-backup"><summary>Encrypted key backup & restore</summary><p>This private backup includes your signing keys, event history and queue. Public bundle exports cannot recover keys. Device recovery and key rotation are not implemented.</p><label htmlFor="backup-passphrase">Backup passphrase (12+ characters)</label><input id="backup-passphrase" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" /><div className="action-row"><button disabled={busy} onClick={() => void backup()}>Download encrypted backup</button></div><label htmlFor="backup-restore">Restore encrypted backup into an empty profile</label><input id="backup-restore" type="file" accept="application/json,.json" disabled={busy} onChange={e => void restore(e.target.files?.[0])} /><p role="status">{busy ? "Processing backup…" : status}</p></details>;
}
