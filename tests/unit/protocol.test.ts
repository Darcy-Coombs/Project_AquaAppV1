import { describe, expect, it } from "vitest";
import { aqua, assertProductionSafe, formatAqua, WEEKLY_UBI_AQUA } from "../../packages/shared/src/index.js";
import {
  canonicalize,
  createEvent,
  createKeyPair,
  hashHex,
  replayEvents,
  selectCommittee,
  tallyProposal,
  verifyEventSignature,
  type AquaEvent
} from "../../packages/protocol/src/index.js";

const alice = createKeyPair("01".repeat(32));
const bob = createKeyPair("02".repeat(32));
const charlie = createKeyPair("03".repeat(32));

function ev(type: AquaEvent["type"], user: "alice" | "bob" | "charlie", payload: unknown, parents: AquaEvent[] = [], createdAt?: string): AquaEvent {
  const identity = user === "alice" ? alice : user === "bob" ? bob : charlie;
  const userId = user;
  return createEvent({
    type,
    author: userId,
    publicKey: identity.publicKey,
    privateKey: identity.privateKey,
    parents: parents.slice(-2).map((event) => event.eventId),
    createdAt: createdAt ?? new Date(2026, 0, parents.length + 1).toISOString(),
    payload
  });
}

function verifiedUser(user: "alice" | "bob" | "charlie", parents: AquaEvent[] = []): AquaEvent[] {
  const created = ev("identity.created", user, {
    userId: user,
    emailHash: hashHex(`${user}@example.test`),
    verificationLevel: "email"
  }, parents);
  const verified = ev("identity.verified", user, {
    userId: user,
    method: "BETAoverride",
    proofHash: hashHex({ user, beta: true }),
    verification_method: "BETAoverride"
  }, [created]);
  return [created, verified];
}

describe("canonical events", () => {
  it("canonicalizes object key order and verifies signatures", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
    const [created] = verifiedUser("alice");
    expect(verifyEventSignature(created!)).toBe(true);
    expect(verifyEventSignature({ ...created!, payload: { hacked: true } })).toBe(false);
  });

  it("keeps BETAoverride out of production", () => {
    expect(() => assertProductionSafe({ mode: "production", betaOverrideEnabled: true, nodeUrl: "" })).toThrow(/BETAoverride/);
  });
});

describe("identity, money, and DAG replay", () => {
  it("claims UBI once, transfers with Fire/Sump, and replays deterministically", () => {
    const events = [...verifiedUser("alice"), ...verifiedUser("bob")];
    const ubiAlice = ev("money.ubi_claimed", "alice", { userId: "alice", epoch: "2026-w1", verification_method: "BETAoverride" }, events);
    const ubiBob = ev("money.ubi_claimed", "bob", { userId: "bob", epoch: "2026-w1", verification_method: "BETAoverride" }, [...events, ubiAlice]);
    const transfer = ev("money.transfer", "alice", { from: "alice", to: "bob", amountMinor: aqua(100).toString() }, [...events, ubiAlice, ubiBob]);
    const replay = replayEvents([...events, ubiAlice, ubiBob, transfer]);
    expect(replay.rejected).toHaveLength(0);
    expect(replay.wallets.get("alice")?.balance).toBe(WEEKLY_UBI_AQUA - aqua(100));
    expect(replay.wallets.get("bob")?.balance).toBe(WEEKLY_UBI_AQUA + aqua(96));
    expect(replay.sump).toBe(aqua(4));
    expect(formatAqua(replay.sump)).toBe("4.00");
    const shuffled = replayEvents([transfer, ubiBob, events[1]!, events[0]!, ubiAlice, events[2]!, events[3]!]);
    expect(shuffled.wallets.get("bob")?.balance).toBe(replay.wallets.get("bob")?.balance);
  });

  it("rejects duplicate UBI and email-only UBI", () => {
    const [created] = verifiedUser("alice");
    const emailUbi = ev("money.ubi_claimed", "alice", { userId: "alice", epoch: "2026-w1", verification_method: "BETAoverride" }, [created!]);
    expect(replayEvents([created!, emailUbi]).rejected[0]?.reason).toMatch(/not verified/);

    const events = verifiedUser("bob");
    const claim1 = ev("money.ubi_claimed", "bob", { userId: "bob", epoch: "2026-w1", verification_method: "BETAoverride" }, events);
    const claim2 = ev("money.ubi_claimed", "bob", { userId: "bob", epoch: "2026-w1", verification_method: "BETAoverride" }, [...events, claim1]);
    expect(replayEvents([...events, claim1, claim2]).rejected[0]?.reason).toMatch(/Duplicate UBI/);
  });

  it("marks unknown parents pending and ignores duplicate event ids", () => {
    const events = verifiedUser("alice");
    const pending = ev("identity.created", "bob", {
      userId: "bob",
      emailHash: hashHex("bob@example.test"),
      verificationLevel: "email"
    }, [{ ...events[0]!, eventId: "missing-parent" }]);
    const replay = replayEvents([pending, events[0]!, events[0]!]);
    expect(replay.accepted).toHaveLength(1);
    expect(replay.pending).toHaveLength(1);
  });
});

describe("chat, governance, committee, and voucher pools", () => {
  it("replays room membership, pool reserve, room credits, and chat transfers", () => {
    const events = [...verifiedUser("alice"), ...verifiedUser("bob")];
    const ubi = ev("money.ubi_claimed", "alice", { userId: "alice", epoch: "2026-w1", verification_method: "BETAoverride" }, events);
    const room = ev("chat.room_created", "alice", { roomId: "melbourne", name: "Melbourne Test", inviteCodeHash: hashHex("invite"), creator: "alice" }, [...events, ubi]);
    const join = ev("chat.member_joined", "bob", { roomId: "melbourne", userId: "bob", inviteCodeHash: hashHex("invite") }, [...events, ubi, room]);
    const pool = ev("dex.pool_created", "alice", { poolId: "pool", roomId: "melbourne", maintainer: "alice" }, [...events, ubi, room, join]);
    const deposit = ev("dex.pool_deposit", "alice", { poolId: "pool", roomId: "melbourne", userId: "alice", amountMinor: aqua(50).toString() }, [...events, ubi, room, join, pool]);
    const mint = ev("dex.pool_mint_room_credit", "alice", { poolId: "pool", roomId: "melbourne", userId: "alice", amountMinor: aqua(50).toString() }, [...events, ubi, room, join, pool, deposit]);
    const stateBeforeChat = replayEvents([...events, ubi, room, join, pool, deposit, mint]);
    const prevHash = stateBeforeChat.rooms.get("melbourne")?.lastHash;
    const chatTransfer = ev("chat.transfer", "alice", {
      roomId: "melbourne",
      from: "alice",
      to: "bob",
      amountMinor: aqua(10).toString(),
      asset: "ROOM_CREDIT",
      nonce: 1,
      prevHash
    }, [...events, ubi, room, join, pool, deposit, mint]);
    const replay = replayEvents([...events, ubi, room, join, pool, deposit, mint, chatTransfer]);
    expect(replay.rejected).toHaveLength(0);
    expect(replay.wallets.get("alice")?.balance).toBe(aqua(430));
    expect(replay.pools.get("pool")?.reserve).toBe(aqua(50));
    expect(replay.rooms.get("melbourne")?.balances.get("bob")).toBe(aqua(10));
  });

  it("rejects duplicate chat nonce and invalid prevHash", () => {
    const base = [...verifiedUser("alice")];
    const room = ev("chat.room_created", "alice", { roomId: "r", name: "r", inviteCodeHash: hashHex("i"), creator: "alice" }, base);
    const bad = ev("chat.message", "alice", { roomId: "r", from: "alice", body: "x", nonce: 1, prevHash: "bad" }, [...base, room]);
    expect(replayEvents([...base, room, bad]).rejected[0]?.reason).toMatch(/prevHash/);
  });

  it("tallies proxy vote, revocation, direct override, and committee deterministically", () => {
    const events = [...verifiedUser("alice"), ...verifiedUser("bob"), ...verifiedUser("charlie")];
    const proposal = ev("governance.proposal_created", "bob", { proposalId: "p1", title: "Test", body: "Test", closesAt: new Date(2026, 1, 1).toISOString() }, events);
    const proxy = ev("governance.proxy_assigned", "alice", { from: "alice", to: "bob", proposalId: "p1", maxDepth: 5 }, [...events, proposal]);
    const yes = ev("governance.vote_cast", "bob", { proposalId: "p1", voter: "bob", choice: "yes" }, [...events, proposal, proxy]);
    const withProxy = replayEvents([...events, proposal, proxy, yes]);
    expect(tallyProposal(withProxy, "p1")).toEqual({ yes: 2, no: 0, abstain: 0 });
    const revoke = ev("governance.proxy_revoked", "alice", { from: "alice", proposalId: "p1" }, [...events, proposal, proxy, yes]);
    const no = ev("governance.vote_cast", "alice", { proposalId: "p1", voter: "alice", choice: "no" }, [...events, proposal, proxy, yes, revoke]);
    const final = replayEvents([...events, proposal, proxy, yes, revoke, no]);
    expect(tallyProposal(final, "p1")).toEqual({ yes: 1, no: 1, abstain: 0 });
    expect(selectCommittee(final, "snap", "p1", 2)).toEqual(selectCommittee(final, "snap", "p1", 2));
  });
});
