import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { schnorr } from "@noble/curves/secp256k1";
import { NostrRelay } from "../utils/ephemeral-relay.js";
import { KINDS, QUERY_TIMEOUT } from "../utils/constants.js";

import { setRelayList, getRelayList } from "../relay/relay-tools.js";

describe("relay-tools", () => {
  let relay: NostrRelay;
  let relayUrl: string;
  let authRelay: NostrRelay;
  let authRelayUrl: string;

  // Fixed test key (32 bytes hex). Not used outside this test context.
  const privateKey = "0000000000000000000000000000000000000000000000000000000000000001";
  const pubkey = Buffer.from(schnorr.getPublicKey(privateKey)).toString("hex");

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

  test("setRelayList publishes kind 10002 and getRelayList parses it", async () => {
    const setRes = await setRelayList({
      privateKey,
      relays: [relayUrl],
      relayList: [
        { url: "wss://relay.example.com", read: true, write: true },
        { url: "wss://read.example.com", read: true, write: false },
        { url: "wss://write.example.com", read: false, write: true },
      ],
    });
    expect(setRes.success).toBe(true);

    const deadline = Date.now() + QUERY_TIMEOUT;
    let got: any = null;
    while (Date.now() < deadline) {
      got = await getRelayList({ pubkey, relays: [relayUrl] });
      if (got.success && (got.relays ?? []).length >= 3) break;
      await new Promise((r) => setTimeout(r, 25));
    }

    expect(got?.success).toBe(true);
    const urls = (got.relays ?? []).map((r: any) => r.url);
    expect(urls).toContain("wss://relay.example.com");
    expect(urls).toContain("wss://read.example.com");
    expect(urls).toContain("wss://write.example.com");
    expect(got.event?.kind).toBe(KINDS.RELAY_LIST);
  });

  test("getRelayList returns a query failure when auth is required but not provided", async () => {
    const res = await getRelayList({ pubkey, relays: [authRelayUrl] });
    expect(res.success).toBe(false);
    expect(res.message).toContain("auth_required");
  });

  test("setRelayList/getRelayList work on auth-required relays when auth is provided", async () => {
    const setRes = await setRelayList({
      privateKey,
      relays: [authRelayUrl],
      relayList: [{ url: "wss://auth-only.example.com", read: true, write: true }],
    });
    expect(setRes.success).toBe(true);

    const got = await getRelayList({
      pubkey,
      relays: [authRelayUrl],
      authPrivateKey: privateKey,
    });
    expect(got.success).toBe(true);
    const urls = (got.relays ?? []).map((r: any) => r.url);
    expect(urls).toContain("wss://auth-only.example.com");
  });
});
