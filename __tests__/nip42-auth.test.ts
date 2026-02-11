import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { NostrRelay } from "../utils/ephemeral-relay.js";

import { createNostrEvent, signNostrEvent, publishNostrEvent, queryEvents } from "../event/event-tools.js";
import { KINDS } from "../utils/constants.js";

describe("NIP-42 AUTH", () => {
  let relay: NostrRelay;
  let relayUrl: string;

  // Fixed test key (32 bytes hex). Not used outside this test context.
  const privateKey = "0000000000000000000000000000000000000000000000000000000000000001";

  beforeAll(async () => {
    relay = new NostrRelay(0, undefined, true);
    await relay.start();
    relayUrl = relay.url;
  });

  afterAll(async () => {
    await relay.close();
  });

  test("publish/query fail without authPrivateKey and succeed with it", async () => {
    const created = await createNostrEvent({
      kind: KINDS.TEXT,
      content: `auth-${Date.now()}`,
      tags: [],
      privateKey,
    });
    expect(created.success).toBe(true);

    const signed = await signNostrEvent({ privateKey, event: created.event as any });
    expect(signed.success).toBe(true);

    const noAuthPub = await publishNostrEvent({ signedEvent: signed.signedEvent as any, relays: [relayUrl] });
    expect(noAuthPub.success).toBe(false);

    const withAuthPub = await publishNostrEvent({
      signedEvent: signed.signedEvent as any,
      relays: [relayUrl],
      authPrivateKey: privateKey,
    });
    expect(withAuthPub.success).toBe(true);

    const noAuthQuery = await queryEvents({
      relays: [relayUrl],
      kinds: [KINDS.TEXT],
      authors: [signed.signedEvent!.pubkey],
      limit: 10,
    });
    expect(noAuthQuery.success).toBe(false);

    const withAuthQuery = await queryEvents({
      relays: [relayUrl],
      authPrivateKey: privateKey,
      kinds: [KINDS.TEXT],
      authors: [signed.signedEvent!.pubkey],
      limit: 10,
    });
    expect(withAuthQuery.success).toBe(true);
    expect((withAuthQuery.events ?? []).some((e: any) => e.id === signed.signedEvent!.id)).toBe(true);
  });
});

