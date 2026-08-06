import { PROXY_MAX_DEPTH, WEEKLY_UBI_AQUA } from "@aqua/shared";
import { z } from "zod";
import { aquaEventSchema, type AquaEvent, type UnsignedAquaEvent } from "./types.js";
import { signEvent, verifyEventSignature } from "./crypto.js";

export const identityCreatedPayload = z.object({
  userId: z.string(),
  emailHash: z.string().optional(),
  verificationLevel: z.enum(["guest", "email", "pohw_lite", "beta_override"])
});

export const identityVerifiedPayload = z.object({
  userId: z.string(),
  method: z.enum(["pohw_lite", "BETAoverride", "vouch", "manual_dev"]),
  proofHash: z.string(),
  verifier: z.string().optional(),
  verification_method: z.enum(["pohw_lite", "BETAoverride", "vouch", "manual_dev"]).optional()
});

export const ubiPayload = z.object({
  userId: z.string(),
  epoch: z.string(),
  requestedMinor: z.string().default(WEEKLY_UBI_AQUA.toString()),
  verification_method: z.enum(["pohw_lite", "BETAoverride"])
});

export const transferPayload = z.object({
  from: z.string(),
  to: z.string(),
  amountMinor: z.string().regex(/^[1-9][0-9]*$/)
});

export const chatRoomPayload = z.object({
  roomId: z.string(),
  name: z.string(),
  inviteCodeHash: z.string(),
  creator: z.string()
});

export const chatJoinPayload = z.object({
  roomId: z.string(),
  userId: z.string(),
  inviteCodeHash: z.string()
});

export const chatMessagePayload = z.object({
  roomId: z.string(),
  from: z.string(),
  body: z.string(),
  nonce: z.number().int().nonnegative(),
  prevHash: z.string()
});

export const chatTransferPayload = z.object({
  roomId: z.string(),
  from: z.string(),
  to: z.string(),
  amountMinor: z.string().regex(/^[1-9][0-9]*$/),
  asset: z.enum(["ROOM_CREDIT", "AQUA"]).default("ROOM_CREDIT"),
  nonce: z.number().int().nonnegative(),
  prevHash: z.string()
});

export const proposalPayload = z.object({
  proposalId: z.string(),
  title: z.string(),
  body: z.string(),
  closesAt: z.string().datetime()
});

export const votePayload = z.object({
  proposalId: z.string(),
  voter: z.string(),
  choice: z.enum(["yes", "no", "abstain"])
});

export const proxyAssignPayload = z.object({
  from: z.string(),
  to: z.string(),
  proposalId: z.string().optional(),
  maxDepth: z.number().int().positive().max(PROXY_MAX_DEPTH).default(PROXY_MAX_DEPTH)
});

export const proxyRevokePayload = z.object({
  from: z.string(),
  proposalId: z.string().optional()
});

export const committeePayload = z.object({
  proposalId: z.string(),
  snapshotHash: z.string(),
  size: z.number().int().positive(),
  optedOut: z.array(z.string()).default([])
});

export const poolCreatedPayload = z.object({
  poolId: z.string(),
  roomId: z.string(),
  maintainer: z.string()
});

export const poolAmountPayload = z.object({
  poolId: z.string(),
  roomId: z.string(),
  userId: z.string(),
  amountMinor: z.string().regex(/^[1-9][0-9]*$/)
});

export function createEvent(input: {
  type: UnsignedAquaEvent["type"];
  author: string;
  publicKey: string;
  privateKey: string;
  parents?: string[];
  payload: unknown;
  createdAt?: string;
}): AquaEvent {
  return signEvent(input.privateKey, {
    type: input.type,
    version: 1,
    createdAt: input.createdAt ?? new Date().toISOString(),
    author: input.author,
    publicKey: input.publicKey,
    parents: input.parents ?? [],
    payload: input.payload
  });
}

export function validateEnvelope(event: AquaEvent): void {
  aquaEventSchema.parse(event);
  if (!verifyEventSignature(event)) throw new Error("Invalid event signature or eventId");
}

export function parsePayload(event: AquaEvent): unknown {
  switch (event.type) {
    case "identity.created": return identityCreatedPayload.parse(event.payload);
    case "identity.verified": return identityVerifiedPayload.parse(event.payload);
    case "money.ubi_claimed": return ubiPayload.parse(event.payload);
    case "money.transfer": return transferPayload.parse(event.payload);
    case "chat.room_created": return chatRoomPayload.parse(event.payload);
    case "chat.member_joined": return chatJoinPayload.parse(event.payload);
    case "chat.message": return chatMessagePayload.parse(event.payload);
    case "chat.transfer": return chatTransferPayload.parse(event.payload);
    case "governance.proposal_created": return proposalPayload.parse(event.payload);
    case "governance.vote_cast": return votePayload.parse(event.payload);
    case "governance.proxy_assigned": return proxyAssignPayload.parse(event.payload);
    case "governance.proxy_revoked": return proxyRevokePayload.parse(event.payload);
    case "governance.committee_selected": return committeePayload.parse(event.payload);
    case "dex.pool_created": return poolCreatedPayload.parse(event.payload);
    case "dex.pool_deposit":
    case "dex.pool_mint_room_credit":
    case "dex.pool_burn_room_credit":
    case "dex.pool_release_aqua": return poolAmountPayload.parse(event.payload);
    case "node.peer_seen":
    case "node.snapshot_created": return event.payload;
  }
}
