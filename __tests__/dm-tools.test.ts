import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { schnorr } from "@noble/curves/secp256k1";
import { NostrRelay } from "../utils/ephemeral-relay.js";
import { QUERY_TIMEOUT } from "../utils/constants.js";

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
  let authRelay: NostrRelay;
  let authRelayUrl: string;

  // Fixed test keys (32 bytes hex). Not used outside this test context.
  const alicePriv = "0000000000000000000000000000000000000000000000000000000000000001";
  const bobPriv = "0000000000000000000000000000000000000000000000000000000000000002";
  const alicePub = Buffer.from(schnorr.getPublicKey(alicePriv)).toString("hex");
  const bobPub = Buffer.from(schnorr.getPublicKey(bobPriv)).toString("hex");

  beforeAll(async () => {
    relay = new NostrRelay(0);
    await relay.start();
    relayUrl = relay.url;
    authRelay = new NostrRelay(0, undefined, true);
    await authRelay.start();
    authRelayUrl = authRelay.url;
  });

  afterAll(async () => {
    await relay.close();
    await authRelay.close();
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
    const deadline = Date.now() + QUERY_TIMEOUT;
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

    const deadline = Date.now() + QUERY_TIMEOUT;
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

  test("DM tools pass authPrivateKey through for NIP-42 relays", async () => {
    const nip04Msg = `auth-nip04-${Date.now()}`;
    const noAuth04 = await sendDmNip04({
      privateKey: alicePriv,
      recipientPubkey: bobPub,
      content: nip04Msg,
      relays: [authRelayUrl],
    });
    expect(noAuth04.success).toBe(false);

    const withAuth04 = await sendDmNip04({
      privateKey: alicePriv,
      recipientPubkey: bobPub,
      content: nip04Msg,
      relays: [authRelayUrl],
      authPrivateKey: alicePriv,
    });
    expect(withAuth04.success).toBe(true);

    const noAuth04Query = await getDmConversationNip04({
      privateKey: bobPriv,
      peerPubkey: alicePub,
      relays: [authRelayUrl],
      limit: 10,
    });
    expect(noAuth04Query.success).toBe(false);

    const deadline04 = Date.now() + QUERY_TIMEOUT;
    let convo04: any = null;
    while (Date.now() < deadline04) {
      convo04 = await getDmConversationNip04({
        privateKey: bobPriv,
        peerPubkey: alicePub,
        relays: [authRelayUrl],
        authPrivateKey: bobPriv,
        limit: 10,
        decrypt: true,
      });
      if (convo04.success && (convo04.messages ?? []).some((m: any) => m.content === nip04Msg)) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(convo04?.success).toBe(true);
    expect((convo04.messages ?? []).some((m: any) => m.content === nip04Msg)).toBe(true);

    const nip44Msg = `auth-nip44-${Date.now()}`;
    const noAuth44 = await sendDmNip44({
      privateKey: alicePriv,
      recipientPubkey: bobPub,
      content: nip44Msg,
      relays: [authRelayUrl],
    });
    expect(noAuth44.success).toBe(false);

    const withAuth44 = await sendDmNip44({
      privateKey: alicePriv,
      recipientPubkey: bobPub,
      content: nip44Msg,
      relays: [authRelayUrl],
      authPrivateKey: alicePriv,
    });
    expect(withAuth44.success).toBe(true);

    const noAuth44Query = await getDmInboxNip44({
      privateKey: bobPriv,
      relays: [authRelayUrl],
      limit: 25,
    });
    expect(noAuth44Query.success).toBe(false);

    const deadline44 = Date.now() + QUERY_TIMEOUT;
    let inbox44: any = null;
    while (Date.now() < deadline44) {
      inbox44 = await getDmInboxNip44({
        privateKey: bobPriv,
        relays: [authRelayUrl],
        authPrivateKey: bobPriv,
        limit: 25,
      });
      if (inbox44.success && (inbox44.messages ?? []).some((m: any) => m.content === nip44Msg)) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(inbox44?.success).toBe(true);
    expect((inbox44.messages ?? []).some((m: any) => m.content === nip44Msg)).toBe(true);
  });

  test("DM conversation/inbox return structured error for invalid private keys", async () => {
    const convo = await getDmConversationNip04({
      privateKey: "bad-key",
      peerPubkey: bobPub,
      relays: [relayUrl],
    });
    expect(convo.success).toBe(false);
    expect(convo.message).toBe("Invalid private key format.");

    const inbox = await getDmInboxNip44({
      privateKey: "bad-key",
      relays: [relayUrl],
    });
    expect(inbox.success).toBe(false);
    expect(inbox.message).toBe("Invalid private key format.");
  });
});
