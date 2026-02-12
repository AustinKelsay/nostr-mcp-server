import { z } from "zod";
import { schnorr } from "@noble/curves/secp256k1";
import {
  createEvent,
  encryptNIP04,
  decryptNIP04,
  encryptNIP44,
  decryptNIP44,
  createDirectMessage,
  decryptDirectMessage,
  GIFT_WRAP_KIND,
} from "snstr";

import { DEFAULT_RELAYS, KINDS } from "../utils/constants.js";
import { NostrEvent, normalizePrivateKey, npubToHex } from "../utils/index.js";
import { publishNostrEvent, queryEvents, signNostrEvent } from "../event/event-tools.js";

function pubkeyFromPrivateKey(privateKeyHex: string): string {
  return Buffer.from(schnorr.getPublicKey(privateKeyHex)).toString("hex");
}

function sortByCreatedAtDescStable<T extends { created_at?: number; id?: string }>(events: T[]): T[] {
  return events.slice().sort((a, b) => {
    const at = typeof a?.created_at === "number" ? a.created_at : 0;
    const bt = typeof b?.created_at === "number" ? b.created_at : 0;
    if (bt !== at) return bt - at;
    return String(b?.id ?? "").localeCompare(String(a?.id ?? ""));
  });
}

export const encryptNip04ToolConfig = {
  privateKey: z.string().describe("Sender private key (hex or nsec)"),
  recipientPubkey: z.string().describe("Recipient public key (hex or npub)"),
  plaintext: z.string().describe("Message to encrypt"),
};

export async function encryptNip04(params: {
  privateKey: string;
  recipientPubkey: string;
  plaintext: string;
}): Promise<{ success: boolean; message: string; ciphertext?: string }> {
  try {
    const privHex = normalizePrivateKey(params.privateKey);
    const recipientHex = npubToHex(params.recipientPubkey);
    if (!recipientHex) return { success: false, message: "Invalid recipient pubkey format. Provide hex or npub." };
    const ciphertext = encryptNIP04(privHex, recipientHex, params.plaintext ?? "");
    return { success: true, message: "Encrypted (NIP-04).", ciphertext };
  } catch (e: any) {
    return { success: false, message: `NIP-04 encryption failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const decryptNip04ToolConfig = {
  privateKey: z.string().describe("Recipient private key (hex or nsec)"),
  senderPubkey: z.string().describe("Sender public key (hex or npub)"),
  ciphertext: z.string().describe("Encrypted content (NIP-04 format: <cipher>?iv=<iv>)"),
};

export async function decryptNip04(params: {
  privateKey: string;
  senderPubkey: string;
  ciphertext: string;
}): Promise<{ success: boolean; message: string; plaintext?: string }> {
  try {
    const privHex = normalizePrivateKey(params.privateKey);
    const senderHex = npubToHex(params.senderPubkey);
    if (!senderHex) return { success: false, message: "Invalid sender pubkey format. Provide hex or npub." };
    const plaintext = decryptNIP04(privHex, senderHex, params.ciphertext ?? "");
    return { success: true, message: "Decrypted (NIP-04).", plaintext };
  } catch (e: any) {
    return { success: false, message: `NIP-04 decryption failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const sendDmNip04ToolConfig = {
  privateKey: z.string().describe("Sender private key (hex or nsec)"),
  recipientPubkey: z.string().describe("Recipient public key (hex or npub)"),
  content: z.string().describe("Plaintext message content"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to publish to"),
  authPrivateKey: z.string().optional().describe("Optional private key (hex or nsec) used to AUTH (NIP-42) if relays require it"),
  createdAt: z.number().int().nonnegative().optional().describe("Optional created_at timestamp (unix seconds)"),
};

export async function sendDmNip04(params: {
  privateKey: string;
  recipientPubkey: string;
  content: string;
  relays?: string[];
  authPrivateKey?: string;
  createdAt?: number;
}): Promise<{ success: boolean; message: string; eventId?: string }> {
  try {
    const relays = params.relays?.length ? params.relays : DEFAULT_RELAYS;
    const privHex = normalizePrivateKey(params.privateKey);
    const senderHex = pubkeyFromPrivateKey(privHex);
    const recipientHex = npubToHex(params.recipientPubkey);
    if (!recipientHex) return { success: false, message: "Invalid recipient pubkey format. Provide hex or npub." };

    const ciphertext = encryptNIP04(privHex, recipientHex, params.content ?? "");
    const unsigned = createEvent(
      {
        kind: KINDS.DIRECT_MESSAGE,
        created_at: params.createdAt ?? Math.floor(Date.now() / 1000),
        content: ciphertext,
        tags: [["p", recipientHex]],
      },
      senderHex,
    ) as any;

    const signedRes = await signNostrEvent({ privateKey: params.privateKey, event: unsigned });
    if (!signedRes.success || !signedRes.signedEvent) return { success: false, message: signedRes.message };

    const pubRes = await publishNostrEvent({ signedEvent: signedRes.signedEvent, relays, authPrivateKey: params.authPrivateKey });
    if (!pubRes.success) return { success: false, message: pubRes.message };

    return { success: true, message: pubRes.message, eventId: signedRes.signedEvent.id };
  } catch (e: any) {
    return { success: false, message: `Failed to send NIP-04 DM: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const getDmConversationNip04ToolConfig = {
  privateKey: z.string().describe("Your private key (hex or nsec) for decrypting the conversation"),
  peerPubkey: z.string().describe("Peer public key (hex or npub)"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query"),
  authPrivateKey: z.string().optional().describe("Optional private key (hex or nsec) used to AUTH (NIP-42) if relays require it"),
  since: z.number().int().nonnegative().optional().describe("Optional start timestamp (unix seconds)"),
  until: z.number().int().nonnegative().optional().describe("Optional end timestamp (unix seconds)"),
  limit: z.number().int().min(1).max(200).default(50).describe("Maximum number of messages to return"),
  decrypt: z.boolean().default(true).describe("If true, decrypt and return plaintext content"),
};

export async function getDmConversationNip04(params: {
  privateKey: string;
  peerPubkey: string;
  relays?: string[];
  authPrivateKey?: string;
  since?: number;
  until?: number;
  limit?: number;
  decrypt?: boolean;
}): Promise<{
  success: boolean;
  message: string;
  messages?: {
    id: string;
    created_at: number;
    direction: "sent" | "received";
    pubkey: string;
    content: string;
  }[];
}> {
  const relays = params.relays?.length ? params.relays : DEFAULT_RELAYS;
  let privHex: string;
  let meHex: string;
  try {
    privHex = normalizePrivateKey(params.privateKey);
    meHex = pubkeyFromPrivateKey(privHex);
  } catch {
    return { success: false, message: "Invalid private key format." };
  }
  const peerHex = npubToHex(params.peerPubkey);
  if (!peerHex) return { success: false, message: "Invalid peer pubkey format. Provide hex or npub." };

  const limit = params.limit ?? 50;
  // We need two queries because Nostr filters can't express (A->B OR B->A) in one filter.
  const sent = await queryEvents({
    relays,
    authPrivateKey: params.authPrivateKey,
    kinds: [KINDS.DIRECT_MESSAGE],
    authors: [meHex],
    tags: { p: [peerHex] },
    since: params.since,
    until: params.until,
    limit: Math.min(200, Math.ceil(limit * 1.5)),
  });

  const received = await queryEvents({
    relays,
    authPrivateKey: params.authPrivateKey,
    kinds: [KINDS.DIRECT_MESSAGE],
    authors: [peerHex],
    tags: { p: [meHex] },
    since: params.since,
    until: params.until,
    limit: Math.min(200, Math.ceil(limit * 1.5)),
  });

  if (!sent.success && !received.success) {
    return { success: false, message: `Failed to query DMs.\n\nSent:\n${sent.message}\n\nReceived:\n${received.message}` };
  }

  const uniq = new Map<string, NostrEvent>();
  for (const e of sent.events ?? []) if (e?.id) uniq.set(e.id, e);
  for (const e of received.events ?? []) if (e?.id) uniq.set(e.id, e);

  const merged = sortByCreatedAtDescStable(Array.from(uniq.values())).slice(0, limit);
  const decrypt = params.decrypt !== false;

  const messages = merged.map((evt) => {
    const direction: "sent" | "received" = evt.pubkey === meHex ? "sent" : "received";
    let content = evt.content ?? "";
    if (decrypt) {
      try {
        content = decryptNIP04(privHex, peerHex, String(evt.content ?? ""));
      } catch {
        content = "[decryption failed]";
      }
    }
    return { id: evt.id, created_at: evt.created_at, direction, pubkey: evt.pubkey, content: String(content ?? "") };
  });

  return {
    success: true,
    message: `Found ${messages.length} messages in NIP-04 conversation.`,
    messages,
  };
}

export const encryptNip44ToolConfig = {
  privateKey: z.string().describe("Sender private key (hex or nsec)"),
  recipientPubkey: z.string().describe("Recipient public key (hex or npub)"),
  plaintext: z.string().describe("Message to encrypt"),
  version: z.number().int().optional().describe("Optional NIP-44 version to use for encryption (snstr default if omitted)"),
};

export async function encryptNip44(params: {
  privateKey: string;
  recipientPubkey: string;
  plaintext: string;
  version?: number;
}): Promise<{ success: boolean; message: string; ciphertext?: string }> {
  try {
    const privHex = normalizePrivateKey(params.privateKey);
    const recipientHex = npubToHex(params.recipientPubkey);
    if (!recipientHex) return { success: false, message: "Invalid recipient pubkey format. Provide hex or npub." };
    const ciphertext = encryptNIP44(params.plaintext ?? "", privHex, recipientHex, undefined, params.version ? { version: params.version } : undefined);
    return { success: true, message: "Encrypted (NIP-44).", ciphertext };
  } catch (e: any) {
    return { success: false, message: `NIP-44 encryption failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const decryptNip44ToolConfig = {
  privateKey: z.string().describe("Recipient private key (hex or nsec)"),
  senderPubkey: z.string().describe("Sender public key (hex or npub)"),
  ciphertext: z.string().describe("Encrypted content (NIP-44 base64 payload)"),
};

export async function decryptNip44(params: {
  privateKey: string;
  senderPubkey: string;
  ciphertext: string;
}): Promise<{ success: boolean; message: string; plaintext?: string }> {
  try {
    const privHex = normalizePrivateKey(params.privateKey);
    const senderHex = npubToHex(params.senderPubkey);
    if (!senderHex) return { success: false, message: "Invalid sender pubkey format. Provide hex or npub." };
    const plaintext = decryptNIP44(params.ciphertext ?? "", privHex, senderHex);
    return { success: true, message: "Decrypted (NIP-44).", plaintext };
  } catch (e: any) {
    return { success: false, message: `NIP-44 decryption failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const sendDmNip44ToolConfig = {
  privateKey: z.string().describe("Sender private key (hex or nsec)"),
  recipientPubkey: z.string().describe("Recipient public key (hex or npub)"),
  content: z.string().describe("Plaintext message content"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to publish to"),
  authPrivateKey: z.string().optional().describe("Optional private key (hex or nsec) used to AUTH (NIP-42) if relays require it"),
};

export async function sendDmNip44(params: {
  privateKey: string;
  recipientPubkey: string;
  content: string;
  relays?: string[];
  authPrivateKey?: string;
}): Promise<{ success: boolean; message: string; eventId?: string }> {
  try {
    const relays = params.relays?.length ? params.relays : DEFAULT_RELAYS;
    const privHex = normalizePrivateKey(params.privateKey);
    const recipientHex = npubToHex(params.recipientPubkey);
    if (!recipientHex) return { success: false, message: "Invalid recipient pubkey format. Provide hex or npub." };

    const giftWrap = await createDirectMessage(params.content ?? "", privHex, recipientHex);
    const pubRes = await publishNostrEvent({ signedEvent: giftWrap as any, relays, authPrivateKey: params.authPrivateKey });
    if (!pubRes.success) return { success: false, message: pubRes.message };
    return { success: true, message: pubRes.message, eventId: giftWrap.id };
  } catch (e: any) {
    return { success: false, message: `Failed to send NIP-44 DM (NIP-17 gift wrap): ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const decryptDmNip44ToolConfig = {
  privateKey: z.string().describe("Receiver private key (hex or nsec)"),
  giftWrapEvent: z
    .object({
      id: z.string(),
      pubkey: z.string(),
      created_at: z.number(),
      kind: z.number(),
      tags: z.array(z.array(z.string())),
      content: z.string(),
      sig: z.string(),
    })
    .describe("The kind 1059 gift wrap event to decrypt"),
};

export async function decryptDmNip44(params: {
  privateKey: string;
  giftWrapEvent: NostrEvent;
}): Promise<{ success: boolean; message: string; rumor?: any }> {
  try {
    const privHex = normalizePrivateKey(params.privateKey);
    const rumor = decryptDirectMessage(params.giftWrapEvent as any, privHex);
    return { success: true, message: "Decrypted gift wrap (NIP-17/NIP-44).", rumor };
  } catch (e: any) {
    return { success: false, message: `Gift wrap decryption failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const getDmInboxNip44ToolConfig = {
  privateKey: z.string().describe("Your private key (hex or nsec) to decrypt your inbox"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query"),
  authPrivateKey: z.string().optional().describe("Optional private key (hex or nsec) used to AUTH (NIP-42) if relays require it"),
  since: z.number().int().nonnegative().optional().describe("Optional start timestamp (unix seconds)"),
  until: z.number().int().nonnegative().optional().describe("Optional end timestamp (unix seconds)"),
  limit: z.number().int().min(1).max(200).default(25).describe("Maximum number of gift wrap events to fetch/decrypt"),
};

export async function getDmInboxNip44(params: {
  privateKey: string;
  relays?: string[];
  authPrivateKey?: string;
  since?: number;
  until?: number;
  limit?: number;
}): Promise<{
  success: boolean;
  message: string;
  messages?: {
    id: string;
    created_at: number;
    from: string;
    content: string;
    rumor?: any;
  }[];
}> {
  const relays = params.relays?.length ? params.relays : DEFAULT_RELAYS;
  let privHex: string;
  let meHex: string;
  try {
    privHex = normalizePrivateKey(params.privateKey);
    meHex = pubkeyFromPrivateKey(privHex);
  } catch {
    return { success: false, message: "Invalid private key format." };
  }
  const limit = params.limit ?? 25;

  const res = await queryEvents({
    relays,
    authPrivateKey: params.authPrivateKey,
    kinds: [GIFT_WRAP_KIND],
    tags: { p: [meHex] },
    since: params.since,
    until: params.until,
    limit,
  });

  if (!res.success) return { success: false, message: res.message };

  const wraps = sortByCreatedAtDescStable(res.events ?? []).slice(0, limit);
  const messages = wraps.map((wrap) => {
    try {
      const rumor = decryptDirectMessage(wrap as any, privHex) as any;
      return {
        id: wrap.id,
        created_at: wrap.created_at,
        from: String(rumor?.pubkey ?? ""),
        content: String(rumor?.content ?? ""),
        rumor,
      };
    } catch {
      return { id: wrap.id, created_at: wrap.created_at, from: "", content: "[decryption failed]" };
    }
  });

  return { success: true, message: `Found ${messages.length} NIP-44 gift wrapped DMs.`, messages };
}
