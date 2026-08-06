import { z } from "zod";

export type EventState = "seen" | "provisionally_accepted" | "historically_anchored" | "pending" | "rejected";
export type IdentityLevel = "guest" | "email" | "pohw_lite" | "beta_override";
export type VoteChoice = "yes" | "no" | "abstain";

export const eventTypeSchema = z.enum([
  "identity.created",
  "identity.verified",
  "money.ubi_claimed",
  "money.transfer",
  "chat.room_created",
  "chat.member_joined",
  "chat.message",
  "chat.transfer",
  "governance.proposal_created",
  "governance.vote_cast",
  "governance.proxy_assigned",
  "governance.proxy_revoked",
  "governance.committee_selected",
  "dex.pool_created",
  "dex.pool_deposit",
  "dex.pool_mint_room_credit",
  "dex.pool_burn_room_credit",
  "dex.pool_release_aqua",
  "node.peer_seen",
  "node.snapshot_created"
]);

export const aquaEventSchema = z.object({
  eventId: z.string().min(16),
  type: eventTypeSchema,
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  author: z.string().min(1),
  publicKey: z.string().min(32),
  parents: z.array(z.string()).max(2),
  payload: z.unknown(),
  signature: z.string().min(32)
});

export type AquaEventType = z.infer<typeof eventTypeSchema>;
export type AquaEvent = z.infer<typeof aquaEventSchema>;
export type UnsignedAquaEvent = Omit<AquaEvent, "eventId" | "signature">;

export type RejectedEvent = {
  event: AquaEvent;
  reason: string;
};

export type AquaBundle = {
  bundleVersion: number;
  createdAt: string;
  sourceNodeId: string;
  events: AquaEvent[];
  snapshot?: unknown;
  signature?: string;
};
