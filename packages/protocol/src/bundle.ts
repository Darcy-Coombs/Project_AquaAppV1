import type { AquaBundle, AquaEvent, RejectedEvent } from "./types.js";
import { replayEvents } from "./replay.js";

export function exportBundle(sourceNodeId: string, events: AquaEvent[]): AquaBundle {
  return {
    bundleVersion: 1,
    createdAt: new Date().toISOString(),
    sourceNodeId,
    events
  };
}

export function importBundle(existing: AquaEvent[], bundle: AquaBundle): { events: AquaEvent[]; acceptedCount: number; rejected: RejectedEvent[] } {
  if (bundle.bundleVersion !== 1 || !Array.isArray(bundle.events)) {
    throw new Error("Unsupported AquaBundle");
  }
  const merged = new Map(existing.map((event) => [event.eventId, event]));
  for (const event of bundle.events) {
    if (!merged.has(event.eventId)) merged.set(event.eventId, event);
  }
  const replay = replayEvents([...merged.values()]);
  const rejectedIds = new Set(replay.rejected.map((entry) => entry.event.eventId));
  const valid = [...merged.values()].filter((event) => !rejectedIds.has(event.eventId));
  return {
    events: valid,
    acceptedCount: valid.length - existing.length,
    rejected: replay.rejected
  };
}
