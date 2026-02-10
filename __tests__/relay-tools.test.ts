import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { schnorr } from "@noble/curves/secp256k1";
import { NostrRelay } from "../utils/ephemeral-relay.js";

import { setRelayList, getRelayList } from "../relay/relay-tools.js";

describe("relay-tools", () => {
  let relay: NostrRelay;
  let relayUrl: string;

  // Fixed test key (32 bytes hex). Not used outside this test context.
  const privateKey = "0000000000000000000000000000000000000000000000000000000000000001";
  const pubkey = Buffer.from(schnorr.getPublicKey(privateKey)).toString("hex");

  beforeAll(async () => {
    relay = new NostrRelay(0);
    await relay.start();
    relayUrl = relay.url;
  });

  afterAll(async () => {
    await relay.close();
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

    const deadline = Date.now() + 2000;
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
  });
});

