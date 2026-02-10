import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { NostrRelay } from "../utils/ephemeral-relay.js";
import { DEFAULT_RELAYS, KINDS, QUERY_TIMEOUT } from "../utils/constants.js";

import {
  createNostrEvent,
  signNostrEvent,
  publishNostrEvent,
  queryEvents,
} from "../event/event-tools.js";

describe("event-tools", () => {
  let relay: NostrRelay;
  let relayUrl: string;

  beforeAll(async () => {
    relay = new NostrRelay(0);
    await relay.start();
    relayUrl = relay.url;
  });

  afterAll(async () => {
    await relay.close();
  });

  test("create/sign/publish/query a generic kind 7 reaction event", async () => {
    // Fixed test key (32 bytes hex). Not used outside this test context.
    const privateKey =
      "0000000000000000000000000000000000000000000000000000000000000001";

    const created = await createNostrEvent({
      kind: KINDS.REACTION,
      content: "+",
      tags: [["e", "deadbeef".repeat(8)]],
      privateKey,
    });

    expect(created.success).toBe(true);
    expect(created.event?.kind).toBe(KINDS.REACTION);
    expect(created.event?.content).toBe("+");

    const signed = await signNostrEvent({
      privateKey,
      event: created.event as any,
    });
    expect(signed.success).toBe(true);
    expect(signed.signedEvent?.id).toBeTruthy();
    expect(signed.signedEvent?.sig).toBeTruthy();

    // Prefer the ephemeral relay for test determinism; fall back to defaults if it's unavailable.
    const relays = relayUrl ? [relayUrl] : DEFAULT_RELAYS;

    const published = await publishNostrEvent({
      signedEvent: signed.signedEvent as any,
      relays,
    });
    if (!published.success) {
      throw new Error(published.message);
    }
    expect(published.success).toBe(true);

    // Poll queryEvents until it shows up (relay sends OK before storing).
    const deadline = Date.now() + QUERY_TIMEOUT;
    let last: any = null;
    while (Date.now() < deadline) {
      last = await queryEvents({
        relays,
        kinds: [KINDS.REACTION],
        authors: [signed.signedEvent!.pubkey],
        limit: 25,
      });
      if (last.success && (last.events ?? []).some((e: any) => e.id === signed.signedEvent!.id)) break;
      await new Promise((r) => setTimeout(r, 25));
    }

    if (!last?.success) {
      throw new Error(last?.message || "queryEvents failed");
    }
    expect((last.events ?? []).some((e: any) => e.id === signed.signedEvent!.id)).toBe(true);
  });
});
