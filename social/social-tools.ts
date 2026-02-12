import { z } from "zod";
import { schnorr } from "@noble/curves/secp256k1";
import {
  createContactListEvent,
  parseContactsFromEvent,
  createReplyTags,
  parseThreadReferences,
  createEvent,
  decode as nip19decode,
} from "snstr";

import {
  NostrEvent,
  NostrFilter,
  formatContacts,
  formatPubkey,
  normalizePrivateKey,
  npubToHex,
} from "../utils/index.js";
import { DEFAULT_RELAYS, KINDS } from "../utils/constants.js";

import { queryEvents, publishNostrEvent, signNostrEvent } from "../event/event-tools.js";

function pubkeyFromPrivateKey(privateKeyHex: string): string {
  return Buffer.from(schnorr.getPublicKey(privateKeyHex)).toString("hex");
}

function normalizeEventId(input: string): string | null {
  const clean = input.trim();
  if (/^[0-9a-fA-F]{64}$/.test(clean)) return clean.toLowerCase();

  try {
    const decoded = nip19decode(clean as `${string}1${string}`);
    if (decoded.type === "note") return String(decoded.data).toLowerCase();
    if (decoded.type === "nevent" && (decoded.data as any)?.id) return String((decoded.data as any).id).toLowerCase();
  } catch {
    // ignore
  }

  return null;
}

async function getLatestEventForAuthor(params: {
  relays: string[];
  kind: number;
  authorHex: string;
}): Promise<NostrEvent | null> {
  const res = await queryEvents({
    relays: params.relays,
    kinds: [params.kind],
    authors: [params.authorHex],
    limit: 10,
  });
  if (!res.success) return null;
  const events = (res.events ?? []).slice();
  // queryEvents relay ordering is not guaranteed; pick the newest deterministically.
  events.sort((a, b) => {
    const at = typeof a?.created_at === "number" ? a.created_at : 0;
    const bt = typeof b?.created_at === "number" ? b.created_at : 0;
    if (bt !== at) return bt - at;
    // Stable tie-breaker for same timestamps.
    return String(b?.id ?? "").localeCompare(String(a?.id ?? ""));
  });
  return events.length ? events[0] : null;
}

async function fetchEventById(params: { relays: string[]; idHex: string }): Promise<NostrEvent | null> {
  const res = await queryEvents({ relays: params.relays, ids: [params.idHex], limit: 5 });
  if (!res.success) return null;
  const events = res.events ?? [];
  return events.find((e) => e.id === params.idHex) ?? (events.length ? events[0] : null);
}

function dedupeContacts(contacts: { pubkey: string; relay?: string; petname?: string }[]) {
  const seen = new Map<string, { pubkey: string; relay?: string; petname?: string }>();
  for (const c of contacts) {
    if (!c?.pubkey) continue;
    // Dedupe by pubkey only (relay/petname are optional hints).
    if (!seen.has(c.pubkey)) {
      seen.set(c.pubkey, c);
    }
  }
  return Array.from(seen.values());
}

export const getContactListToolConfig = {
  pubkey: z.string().describe("Public key of the Nostr user (hex format or npub format)"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query"),
};

export async function getContactList(params: {
  pubkey: string;
  relays?: string[];
}): Promise<{ success: boolean; message: string; event?: NostrEvent; contacts?: any[] }> {
  const authorHex = npubToHex(params.pubkey);
  if (!authorHex) {
    return { success: false, message: "Invalid public key format. Please provide a valid hex pubkey or npub." };
  }

  const relays = params.relays?.length ? params.relays : DEFAULT_RELAYS;
  const evt = await getLatestEventForAuthor({ relays, kind: KINDS.CONTACT_LIST, authorHex });

  if (!evt) {
    return { success: true, message: `No contact list (kind 3) found for ${formatPubkey(authorHex)}.`, contacts: [] };
  }

  const contacts = parseContactsFromEvent(evt as any);
  return {
    success: true,
    message: `Found ${contacts.length} contacts for ${formatPubkey(authorHex)}.`,
    event: evt,
    contacts,
  };
}

export const getFollowingToolConfig = getContactListToolConfig;
export const getFollowing = getContactList;

export const followToolConfig = {
  privateKey: z.string().describe("Private key (hex or nsec) for the account that will follow"),
  targetPubkey: z.string().describe("Pubkey to follow (hex or npub)"),
  relayHint: z.string().optional().describe("Optional relay hint to store alongside the contact (ws:// or wss://)"),
  petname: z.string().optional().describe("Optional petname/alias for this contact"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query/publish to"),
};

export const unfollowToolConfig = {
  privateKey: z.string().describe("Private key (hex or nsec) for the account that will unfollow"),
  targetPubkey: z.string().describe("Pubkey to unfollow (hex or npub)"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query/publish to"),
};

async function upsertContactList(params: {
  privateKey: string;
  relays?: string[];
  mutate: (contacts: { pubkey: string; relay?: string; petname?: string }[]) => { contacts: any[]; summary: string };
}): Promise<{ success: boolean; message: string; eventId?: string }> {
  const relays = params.relays?.length ? params.relays : DEFAULT_RELAYS;
  const privateKeyHex = normalizePrivateKey(params.privateKey);
  const authorHex = pubkeyFromPrivateKey(privateKeyHex);

  const existing = await getLatestEventForAuthor({ relays, kind: KINDS.CONTACT_LIST, authorHex });
  const existingContent = existing?.content ?? "";
  const existingContacts = existing ? (parseContactsFromEvent(existing as any) as any[]) : [];

  const mutated = params.mutate(existingContacts as any);
  const nextContacts = dedupeContacts(mutated.contacts as any);

  const base = createContactListEvent(nextContacts as any, existingContent) as any;
  // Ensure monotonic timestamps so "latest kind 3" is deterministic even when
  // updates occur within the same second.
  if (existing?.created_at && typeof base.created_at === "number" && base.created_at <= existing.created_at) {
    base.created_at = existing.created_at + 1;
  }
  const unsigned: Omit<NostrEvent, "id" | "sig"> = {
    ...base,
    pubkey: authorHex,
  };

  const signedRes = await signNostrEvent({ privateKey: params.privateKey, event: unsigned });
  if (!signedRes.success || !signedRes.signedEvent) {
    return { success: false, message: signedRes.message };
  }

  const pubRes = await publishNostrEvent({ signedEvent: signedRes.signedEvent, relays });
  if (!pubRes.success) return { success: false, message: pubRes.message };

  return { success: true, message: `${mutated.summary}\n${pubRes.message}`, eventId: signedRes.signedEvent.id };
}

export async function follow(params: {
  privateKey: string;
  targetPubkey: string;
  relayHint?: string;
  petname?: string;
  relays?: string[];
}): Promise<{ success: boolean; message: string; eventId?: string }> {
  const targetHex = npubToHex(params.targetPubkey);
  if (!targetHex) {
    return { success: false, message: "Invalid target pubkey format. Provide hex or npub." };
  }

  return upsertContactList({
    privateKey: params.privateKey,
    relays: params.relays,
    mutate: (contacts) => {
      const already = contacts.some((c) => c.pubkey === targetHex);
      const next = already
        ? contacts
        : [
            ...contacts,
            {
              pubkey: targetHex,
              relay: params.relayHint,
              petname: params.petname,
            },
          ];
      return { contacts: next, summary: already ? `Already following ${formatPubkey(targetHex)}.` : `Following ${formatPubkey(targetHex)}.` };
    },
  });
}

export async function unfollow(params: {
  privateKey: string;
  targetPubkey: string;
  relays?: string[];
}): Promise<{ success: boolean; message: string; eventId?: string }> {
  const targetHex = npubToHex(params.targetPubkey);
  if (!targetHex) {
    return { success: false, message: "Invalid target pubkey format. Provide hex or npub." };
  }

  return upsertContactList({
    privateKey: params.privateKey,
    relays: params.relays,
    mutate: (contacts) => {
      const before = contacts.length;
      const next = contacts.filter((c) => c.pubkey !== targetHex);
      const removed = before !== next.length;
      return { contacts: next, summary: removed ? `Unfollowed ${formatPubkey(targetHex)}.` : `Was not following ${formatPubkey(targetHex)}.` };
    },
  });
}

export const reactToEventToolConfig = {
  privateKey: z.string().describe("Private key (hex or nsec) for the reacting account"),
  target: z.string().describe("Target event id (hex, note, or nevent)"),
  reaction: z.string().default("+").describe("Reaction content, typically '+' or '-' (or an emoji)"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query/publish to"),
};

export async function reactToEvent(params: {
  privateKey: string;
  target: string;
  reaction: string;
  relays?: string[];
}): Promise<{ success: boolean; message: string; eventId?: string }> {
  const relays = params.relays?.length ? params.relays : DEFAULT_RELAYS;
  const targetId = normalizeEventId(params.target);
  if (!targetId) return { success: false, message: "Invalid target event id. Provide 64-hex, note, or nevent." };

  const target = await fetchEventById({ relays, idHex: targetId });
  if (!target) return { success: false, message: `Target event not found: ${targetId}` };

  const privateKeyHex = normalizePrivateKey(params.privateKey);
  const authorHex = pubkeyFromPrivateKey(privateKeyHex);

  const unsigned = createEvent(
    {
      kind: KINDS.REACTION,
      content: params.reaction ?? "+",
      tags: [
        ["e", target.id],
        ["p", target.pubkey],
      ],
    },
    authorHex,
  ) as any;

  const signedRes = await signNostrEvent({ privateKey: params.privateKey, event: unsigned });
  if (!signedRes.success || !signedRes.signedEvent) return { success: false, message: signedRes.message };

  const pubRes = await publishNostrEvent({ signedEvent: signedRes.signedEvent, relays });
  if (!pubRes.success) return { success: false, message: pubRes.message };
  return { success: true, message: pubRes.message, eventId: signedRes.signedEvent.id };
}

export const repostEventToolConfig = {
  privateKey: z.string().describe("Private key (hex or nsec) for the reposting account"),
  target: z.string().describe("Target event id (hex, note, or nevent)"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query/publish to"),
};

export async function repostEvent(params: {
  privateKey: string;
  target: string;
  relays?: string[];
}): Promise<{ success: boolean; message: string; eventId?: string }> {
  const relays = params.relays?.length ? params.relays : DEFAULT_RELAYS;
  const targetId = normalizeEventId(params.target);
  if (!targetId) return { success: false, message: "Invalid target event id. Provide 64-hex, note, or nevent." };

  const target = await fetchEventById({ relays, idHex: targetId });
  if (!target) return { success: false, message: `Target event not found: ${targetId}` };

  const privateKeyHex = normalizePrivateKey(params.privateKey);
  const authorHex = pubkeyFromPrivateKey(privateKeyHex);

  const unsigned = createEvent(
    {
      kind: KINDS.REPOST,
      content: JSON.stringify(target),
      tags: [
        ["e", target.id],
        ["p", target.pubkey],
      ],
    },
    authorHex,
  ) as any;

  const signedRes = await signNostrEvent({ privateKey: params.privateKey, event: unsigned });
  if (!signedRes.success || !signedRes.signedEvent) return { success: false, message: signedRes.message };

  const pubRes = await publishNostrEvent({ signedEvent: signedRes.signedEvent, relays });
  if (!pubRes.success) return { success: false, message: pubRes.message };
  return { success: true, message: pubRes.message, eventId: signedRes.signedEvent.id };
}

export const deleteEventToolConfig = {
  privateKey: z.string().describe("Private key (hex or nsec) for the deleting account"),
  targets: z.array(z.string()).min(1).describe("Target event ids (hex, note, or nevent) to delete"),
  reason: z.string().optional().describe("Optional deletion reason"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to publish to"),
};

export async function deleteEvent(params: {
  privateKey: string;
  targets: string[];
  reason?: string;
  relays?: string[];
}): Promise<{ success: boolean; message: string; eventId?: string }> {
  const relays = params.relays?.length ? params.relays : DEFAULT_RELAYS;

  const ids = params.targets.map(normalizeEventId);
  if (ids.some((id) => !id)) return { success: false, message: "One or more target ids are invalid. Provide 64-hex, note, or nevent." };
  const targetsHex = ids as string[];

  const privateKeyHex = normalizePrivateKey(params.privateKey);
  const authorHex = pubkeyFromPrivateKey(privateKeyHex);

  const tags = targetsHex.map((id) => ["e", id]);
  const unsigned = createEvent(
    {
      kind: KINDS.DELETE,
      content: params.reason ?? "",
      tags,
    },
    authorHex,
  ) as any;

  const signedRes = await signNostrEvent({ privateKey: params.privateKey, event: unsigned });
  if (!signedRes.success || !signedRes.signedEvent) return { success: false, message: signedRes.message };

  const pubRes = await publishNostrEvent({ signedEvent: signedRes.signedEvent, relays });
  if (!pubRes.success) return { success: false, message: pubRes.message };
  return { success: true, message: pubRes.message, eventId: signedRes.signedEvent.id };
}

export const replyToEventToolConfig = {
  privateKey: z.string().describe("Private key (hex or nsec) for the replying account"),
  target: z.string().describe("Target event id being replied to (hex, note, or nevent)"),
  content: z.string().describe("Reply text content"),
  tags: z.array(z.array(z.string())).optional().describe("Optional additional tags to include"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query/publish to"),
};

export async function replyToEvent(params: {
  privateKey: string;
  target: string;
  content: string;
  tags?: string[][];
  relays?: string[];
}): Promise<{ success: boolean; message: string; eventId?: string }> {
  const relays = params.relays?.length ? params.relays : DEFAULT_RELAYS;
  const targetId = normalizeEventId(params.target);
  if (!targetId) return { success: false, message: "Invalid target event id. Provide 64-hex, note, or nevent." };

  const target = await fetchEventById({ relays, idHex: targetId });
  if (!target) return { success: false, message: `Target event not found: ${targetId}` };

  const privateKeyHex = normalizePrivateKey(params.privateKey);
  const authorHex = pubkeyFromPrivateKey(privateKeyHex);

  // Determine the root pointer from the target event's existing thread refs.
  const refs = parseThreadReferences(target as any);
  const rootPointer = refs.root ?? { id: target.id, relay: "", pubkey: target.pubkey };
  const replyPointer = { id: target.id, relay: "", pubkey: target.pubkey };

  const nip10Tags = createReplyTags(rootPointer as any, replyPointer as any);

  // Always include the immediate parent author's pubkey.
  const pTags: string[][] = [["p", target.pubkey]];

  const unsigned = createEvent(
    {
      kind: KINDS.TEXT,
      content: params.content,
      tags: [...nip10Tags, ...pTags, ...(params.tags ?? [])],
    },
    authorHex,
  ) as any;

  const signedRes = await signNostrEvent({ privateKey: params.privateKey, event: unsigned });
  if (!signedRes.success || !signedRes.signedEvent) return { success: false, message: signedRes.message };

  const pubRes = await publishNostrEvent({ signedEvent: signedRes.signedEvent, relays });
  if (!pubRes.success) return { success: false, message: pubRes.message };
  return { success: true, message: pubRes.message, eventId: signedRes.signedEvent.id };
}
