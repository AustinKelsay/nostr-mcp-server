import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { schnorr } from "@noble/curves/secp256k1";
import { NostrRelay } from "../utils/ephemeral-relay.js";

import {
  encryptNip04,
  decryptNip04,
  sendDmNip04,
  getDmConversationNip04,
  encryptNip44,
  decryptNip44,
  sendDmNip44,
  getDmInboxNip44,
} from "../dm/dm-tools.js";

describe("dm-tools", () => {
  let relay: NostrRelay;
  let relayUrl: string;

  // Fixed test keys (32 bytes hex). Not used outside this test context.
  const alicePriv = "0000000000000000000000000000000000000000000000000000000000000001";
  const bobPriv = "0000000000000000000000000000000000000000000000000000000000000002";
  const alicePub = Buffer.from(schnorr.getPublicKey(alicePriv)).toString("hex");
  const bobPub = Buffer.from(schnorr.getPublicKey(bobPriv)).toString("hex");

  beforeAll(async () => {
    relay = new NostrRelay(0);
    await relay.start();
    relayUrl = relay.url;
  });

  afterAll(async () => {
    await relay.close();
  });

  test("NIP-04 encrypt/decrypt roundtrip", async () => {
    const msg = `hello-${Date.now()}`;
    const enc = await encryptNip04({ privateKey: alicePriv, recipientPubkey: bobPub, plaintext: msg });
    expect(enc.success).toBe(true);
    expect(enc.ciphertext).toBeTruthy();

    const dec = await decryptNip04({ privateKey: bobPriv, senderPubkey: alicePub, ciphertext: enc.ciphertext! });
    expect(dec.success).toBe(true);
    expect(dec.plaintext).toBe(msg);
  });

  test("NIP-44 encrypt/decrypt roundtrip", async () => {
    const msg = `hello44-${Date.now()}`;
    const enc = await encryptNip44({ privateKey: alicePriv, recipientPubkey: bobPub, plaintext: msg });
    expect(enc.success).toBe(true);
    expect(enc.ciphertext).toBeTruthy();

    const dec = await decryptNip44({ privateKey: bobPriv, senderPubkey: alicePub, ciphertext: enc.ciphertext! });
    expect(dec.success).toBe(true);
    expect(dec.plaintext).toBe(msg);
  });

  test("sendDmNip04 + getDmConversationNip04 decrypts both directions", async () => {
    const a1 = await sendDmNip04({
      privateKey: alicePriv,
      recipientPubkey: bobPub,
      content: "a->b",
      relays: [relayUrl],
    });
    expect(a1.success).toBe(true);

    const b1 = await sendDmNip04({
      privateKey: bobPriv,
      recipientPubkey: alicePub,
      content: "b->a",
      relays: [relayUrl],
    });
    expect(b1.success).toBe(true);

    // Poll until both are queryable (relay OK may arrive before store).
    const deadline = Date.now() + 2000;
    let convo: any = null;
    while (Date.now() < deadline) {
      convo = await getDmConversationNip04({
        privateKey: alicePriv,
        peerPubkey: bobPub,
        relays: [relayUrl],
        limit: 10,
        decrypt: true,
      });
      if (convo.success && (convo.messages ?? []).length >= 2) break;
      await new Promise((r) => setTimeout(r, 25));
    }

    expect(convo?.success).toBe(true);
    const contents = (convo.messages ?? []).map((m: any) => m.content);
    expect(contents).toContain("a->b");
    expect(contents).toContain("b->a");
  });

  test("sendDmNip44 + getDmInboxNip44 decrypts gift wrapped message", async () => {
    const msg = `gift-${Date.now()}`;
    const sent = await sendDmNip44({ privateKey: alicePriv, recipientPubkey: bobPub, content: msg, relays: [relayUrl] });
    expect(sent.success).toBe(true);

    const deadline = Date.now() + 2000;
    let inbox: any = null;
    while (Date.now() < deadline) {
      inbox = await getDmInboxNip44({ privateKey: bobPriv, relays: [relayUrl], limit: 25 });
      if (inbox.success && (inbox.messages ?? []).some((m: any) => m.content === msg)) break;
      await new Promise((r) => setTimeout(r, 25));
    }

    expect(inbox?.success).toBe(true);
    const found = (inbox.messages ?? []).find((m: any) => m.content === msg);
    expect(found).toBeTruthy();
    expect(found.from).toBe(alicePub);
  });
});

