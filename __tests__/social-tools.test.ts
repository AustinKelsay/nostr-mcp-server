import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { NostrRelay } from "../utils/ephemeral-relay.js";
import { schnorr } from "@noble/curves/secp256k1";

import { createNostrEvent, publishNostrEvent, signNostrEvent } from "../event/event-tools.js";
import {
  follow,
  unfollow,
  getContactList,
  reactToEvent,
  repostEvent,
  deleteEvent,
  replyToEvent,
} from "../social/social-tools.js";

describe("social-tools", () => {
  let relay: NostrRelay;
  let relayUrl: string;

  // Fixed test key (32 bytes hex). Not used outside this test context.
  const privateKey = "0000000000000000000000000000000000000000000000000000000000000001";

  beforeAll(async () => {
    relay = new NostrRelay(0);
    await relay.start();
    relayUrl = relay.url;
  });

  afterAll(async () => {
    await relay.close();
  });

  test("follow/unfollow updates kind 3 contact list", async () => {
    const targetPrivateKey = "0000000000000000000000000000000000000000000000000000000000000002";
    const targetPubkey = Buffer.from(schnorr.getPublicKey(targetPrivateKey)).toString("hex");

    const f1 = await follow({ privateKey, targetPubkey, relays: [relayUrl] });
    expect(f1.success).toBe(true);

    // Poll until the contact list reflects the follow.
    const authorPubkey = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
    const deadline = Date.now() + 2000;
    let cl1: any = null;
    while (Date.now() < deadline) {
      cl1 = await getContactList({ pubkey: authorPubkey, relays: [relayUrl] });
      if (cl1.success && (cl1.contacts ?? []).some((c: any) => c.pubkey === targetPubkey)) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(cl1?.success).toBe(true);
    expect((cl1.contacts ?? []).some((c: any) => c.pubkey === targetPubkey)).toBe(true);

    const f2 = await unfollow({ privateKey, targetPubkey, relays: [relayUrl] });
    expect(f2.success).toBe(true);

    // Poll until the contact list reflects the unfollow.
    const deadline2 = Date.now() + 2000;
    let cl2: any = null;
    while (Date.now() < deadline2) {
      cl2 = await getContactList({ pubkey: authorPubkey, relays: [relayUrl] });
      if (cl2.success && !(cl2.contacts ?? []).some((c: any) => c.pubkey === targetPubkey)) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(cl2?.success).toBe(true);
    expect((cl2.contacts ?? []).some((c: any) => c.pubkey === targetPubkey)).toBe(false);
  });

  test("react/repost/delete/reply tools publish correct kinds", async () => {
    // Create a base note to target.
    const created = await createNostrEvent({
      kind: 1,
      content: `hello-${Date.now()}`,
      tags: [],
      privateKey,
    });
    expect(created.success).toBe(true);

    const signed = await signNostrEvent({ privateKey, event: created.event as any });
    expect(signed.success).toBe(true);

    const pub = await publishNostrEvent({ signedEvent: signed.signedEvent as any, relays: [relayUrl] });
    expect(pub.success).toBe(true);

    const targetId = signed.signedEvent!.id;
    // Let the relay store before subsequent queries.
    await new Promise((r) => setTimeout(r, 25));

    const reactRes = await reactToEvent({ privateKey, target: targetId, reaction: "+", relays: [relayUrl] });
    expect(reactRes.success).toBe(true);

    const repostRes = await repostEvent({ privateKey, target: targetId, relays: [relayUrl] });
    expect(repostRes.success).toBe(true);

    const delRes = await deleteEvent({ privateKey, targets: [targetId], reason: "test", relays: [relayUrl] });
    expect(delRes.success).toBe(true);

    const replyRes = await replyToEvent({ privateKey, target: targetId, content: "reply", relays: [relayUrl] });
    expect(replyRes.success).toBe(true);
  });
});
