import { type AquaEvent, verifyEvent } from './event.ts';

export type ValidationResult = {
  ok: boolean;
  reason?: string;
};

export function validateBaseEvent(event: AquaEvent): ValidationResult {
  if (event.protocol !== 'aqua.base.v0.1') return { ok: false, reason: 'unsupported-protocol' };
  if (!Array.isArray(event.parents) || event.parents.length > 2) return { ok: false, reason: 'too-many-parents' };
  if (!verifyEvent(event)) return { ok: false, reason: 'invalid-signature' };
  return { ok: true };
}
