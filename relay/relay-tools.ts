import { z } from "zod";
import { schnorr } from "@noble/curves/secp256k1";
import { createEvent } from "snstr";

import { DEFAULT_RELAYS, KINDS } from "../utils/constants.js";
import { NostrEvent, formatRelayList, normalizePrivateKey, npubToHex } from "../utils/index.js";
import { publishNostrEvent, queryEvents, signNostrEvent } from "../event/event-tools.js";

function pubkeyFromPrivateKey(privateKeyHex: string): string {
  return Buffer.from(schnorr.getPublicKey(privateKeyHex)).toString("hex");
}

function isRelayUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "ws:" || u.protocol === "wss:";
  } catch {
    return false;
  }
}

function parseRelayListFromEvent(evt: NostrEvent): { url: string; read: boolean; write: boolean }[] {
  const map = new Map<string, { url: string; read: boolean; write: boolean }>();
  for (const t of evt.tags ?? []) {
    if (!Array.isArray(t) || t.length < 2) continue;
    if (t[0] !== "r") continue;
    const url = String(t[1] ?? "").trim();
    if (!url) continue;
    const marker = t.length >= 3 ? String(t[2] ?? "").trim().toLowerCase() : "";

    const next = map.get(url) ?? { url, read: false, write: false };
    if (!marker) {
      next.read = true;
      next.write = true;
    } else if (marker === "read") {
      next.read = true;
    } else if (marker === "write") {
      next.write = true;
    }
    map.set(url, next);
  }
  return Array.from(map.values());
}

async function getLatestEventForAuthor(params: {
  relays: string[];
  kind: number;
  authorHex: string;
  authPrivateKey?: string;
}): Promise<{ success: boolean; event: NostrEvent | null; message?: string }> {
  const res = await queryEvents({
    relays: params.relays,
    authPrivateKey: params.authPrivateKey,
    kinds: [params.kind],
    authors: [params.authorHex],
    limit: 20,
  });
  if (!res.success) return { success: false, event: null, message: res.message };
  const events = (res.events ?? []).slice();
  events.sort((a, b) => {
    if (b.created_at !== a.created_at) return b.created_at - a.created_at;
    return String(b.id ?? "").localeCompare(String(a.id ?? ""));
  });
  return { success: true, event: events.length ? events[0] : null };
}

export const getRelayListToolConfig = {
  pubkey: z.string().describe("Public key of the Nostr user (hex format or npub format)"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query"),
  authPrivateKey: z.string().optional().describe("Optional private key (hex or nsec) used to AUTH (NIP-42) if relays require it"),
};

export async function getRelayList(params: {
  pubkey: string;
  relays?: string[];
  authPrivateKey?: string;
}): Promise<{ success: boolean; message: string; event?: NostrEvent; relays?: { url: string; read: boolean; write: boolean }[] }> {
  const authorHex = npubToHex(params.pubkey);
  if (!authorHex) return { success: false, message: "Invalid public key format. Please provide a valid hex pubkey or npub." };

  const relays = params.relays?.length ? params.relays : DEFAULT_RELAYS;
  const latest = await getLatestEventForAuthor({
    relays,
    kind: KINDS.RELAY_LIST,
    authorHex,
    authPrivateKey: params.authPrivateKey,
  });
  if (!latest.success) {
    return { success: false, message: latest.message ?? "Failed to query relay list." };
  }
  const evt = latest.event;

  if (!evt) {
    return { success: true, message: "No relay list (kind 10002) found.", relays: [] };
  }

  const parsed = parseRelayListFromEvent(evt);
  return { success: true, message: `Found ${parsed.length} relays in kind 10002.`, event: evt, relays: parsed };
}

const relayEntrySchema = z.object({
  url: z.string().describe("Relay URL (ws:// or wss://)"),
  read: z.boolean().optional().describe("Whether this relay should be used for reads (default true if both read/write omitted)"),
  write: z.boolean().optional().describe("Whether this relay should be used for writes (default true if both read/write omitted)"),
});

export const setRelayListToolConfig = {
  privateKey: z.string().describe("Private key (hex or nsec) for the account publishing the relay list"),
  relayList: z.array(relayEntrySchema).describe("Relay list entries to publish in kind 10002"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to publish to"),
};

export async function setRelayList(params: {
  privateKey: string;
  relayList: { url: string; read?: boolean; write?: boolean }[];
  relays?: string[];
}): Promise<{ success: boolean; message: string; eventId?: string }> {
  const publishRelays = params.relays?.length ? params.relays : DEFAULT_RELAYS;
  let privateKeyHex: string;
  let authorHex: string;
  try {
    privateKeyHex = normalizePrivateKey(params.privateKey);
    authorHex = pubkeyFromPrivateKey(privateKeyHex);
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Invalid private key." };
  }

  const cleaned = params.relayList
    .map((r) => ({
      url: String(r.url ?? "").trim(),
      read: typeof r.read === "boolean" ? r.read : undefined,
      write: typeof r.write === "boolean" ? r.write : undefined,
    }))
    .filter((r) => r.url.length > 0);

  for (const r of cleaned) {
    if (!isRelayUrl(r.url)) return { success: false, message: `Invalid relay URL: ${r.url} (expected ws:// or wss://)` };
  }

  // Build NIP-65 tags.
  const tagMap = new Map<string, string[][]>();
  for (const r of cleaned) {
    const read = r.read ?? (r.write === undefined ? true : false);
    const write = r.write ?? (r.read === undefined ? true : false);
    if (!read && !write) continue;
    const tags: string[][] = [];
    if (read && write) tags.push(["r", r.url]);
    else if (read) tags.push(["r", r.url, "read"]);
    else if (write) tags.push(["r", r.url, "write"]);
    tagMap.set(r.url, tags);
  }
  const tags = Array.from(tagMap.values()).flat();

  const existing = await getLatestEventForAuthor({
    relays: publishRelays,
    kind: KINDS.RELAY_LIST,
    authorHex,
    authPrivateKey: params.privateKey,
  });
  if (!existing.success) {
    return { success: false, message: existing.message ?? "Failed to query existing relay list." };
  }
  const base = createEvent({ kind: KINDS.RELAY_LIST, content: existing.event?.content ?? "", tags }, authorHex) as any;
  if (existing.event?.created_at && typeof base.created_at === "number" && base.created_at <= existing.event.created_at) {
    base.created_at = existing.event.created_at + 1;
  }

  const unsigned: Omit<NostrEvent, "id" | "sig"> = { ...base, pubkey: authorHex };
  const signedRes = await signNostrEvent({ privateKey: params.privateKey, event: unsigned });
  if (!signedRes.success || !signedRes.signedEvent) return { success: false, message: signedRes.message };

  // Use the same key for NIP-42 AUTH if required.
  const pubRes = await publishNostrEvent({
    signedEvent: signedRes.signedEvent,
    relays: publishRelays,
    authPrivateKey: params.privateKey,
  });
  if (!pubRes.success) return { success: false, message: pubRes.message };

  return { success: true, message: `Relay list published.\n\n${formatRelayList(parseRelayListFromEvent(signedRes.signedEvent))}\n\n${pubRes.message}`, eventId: signedRes.signedEvent.id };
}
