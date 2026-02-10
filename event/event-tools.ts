import { z } from "zod";
import { createEvent, decode as nip19decode, getEventHash, signEvent } from "snstr";
import { schnorr } from "@noble/curves/secp256k1";
import WebSocket from "ws";

import {
  DEFAULT_RELAYS,
  QUERY_TIMEOUT,
  NostrEvent,
  NostrFilter,
  npubToHex,
  formatPubkey,
} from "../utils/index.js";

function normalizePubkey(input: string): string | null {
  const direct = npubToHex(input);
  if (direct) return direct;

  // Support nprofile entities as a convenience.
  try {
    const decoded = nip19decode(input as `${string}1${string}`);
    if (decoded.type === "nprofile" && decoded.data?.pubkey) {
      return String(decoded.data.pubkey).toLowerCase();
    }
  } catch {
    // ignore
  }

  return null;
}

function normalizeEventId(input: string): string | null {
  const clean = input.trim();
  if (/^[0-9a-fA-F]{64}$/.test(clean)) return clean.toLowerCase();

  // note / nevent conveniences
  try {
    const decoded = nip19decode(clean as `${string}1${string}`);
    if (decoded.type === "note") return String(decoded.data).toLowerCase();
    if (decoded.type === "nevent" && decoded.data?.id) return String(decoded.data.id).toLowerCase();
  } catch {
    // ignore
  }

  return null;
}

function normalizePrivateKey(privateKey: string): string {
  const pk = privateKey.trim();

  if (pk.startsWith("nsec")) {
    if (!/^nsec1[0-9a-z]+$/.test(pk)) {
      throw new Error("Invalid nsec format: must match pattern nsec1[0-9a-z]+");
    }

    const decoded = nip19decode(pk as `${string}1${string}`);
    if (decoded.type !== "nsec") throw new Error("Invalid nsec format");
    return String(decoded.data);
  }

  if (!/^[0-9a-f]{64}$/i.test(pk)) {
    throw new Error("Invalid private key format: must be 64-character hex string or valid nsec format");
  }

  return pk.toLowerCase();
}

function pubkeyFromPrivateKey(privateKeyHex: string): string {
  return Buffer.from(schnorr.getPublicKey(privateKeyHex)).toString("hex");
}

function formatEventForDisplay(evt: NostrEvent): string {
  const created = new Date(evt.created_at * 1000).toLocaleString();
  const author = formatPubkey(evt.pubkey, true);
  const content =
    typeof evt.content === "string" && evt.content.length > 240
      ? `${evt.content.slice(0, 240)}…`
      : evt.content ?? "";
  return [
    `Kind: ${evt.kind}`,
    `ID: ${evt.id}`,
    `Author: ${author}`,
    `Created: ${created}`,
    `Content: ${content}`,
    `Tags: ${evt.tags?.length ? JSON.stringify(evt.tags) : "[]"}`,
    `---`,
  ].join("\n");
}

async function queryEventsOverWebSocket(
  relays: string[],
  filter: NostrFilter,
  timeoutMs: number,
): Promise<{ success: boolean; events: NostrEvent[]; details: string[] }> {
  const limit = typeof filter.limit === "number" ? filter.limit : undefined;

  const queryOne = (relayUrl: string) =>
    new Promise<{ relay: string; ok: boolean; events: NostrEvent[]; reason?: string }>((resolve) => {
      const subId = `mcp-${Math.random().toString(16).slice(2, 10)}`;
      const events: NostrEvent[] = [];
      let finished = false;
      let timer: any = null;

      const finish = (ok: boolean, reason?: string) => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        try {
          ws.send(JSON.stringify(["CLOSE", subId]));
        } catch {
          // ignore
        }
        try {
          ws.close();
        } catch {
          // ignore
        }
        resolve({ relay: relayUrl, ok, events, reason });
      };

      const ws = new WebSocket(relayUrl);

      timer = setTimeout(() => finish(false, "timeout"), timeoutMs);

      ws.on("open", () => {
        try {
          ws.send(JSON.stringify(["REQ", subId, filter]));
        } catch (e: any) {
          finish(false, `send_failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      });

      ws.on("message", (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          if (!Array.isArray(msg) || msg.length < 2) return;
          if (msg[0] === "EVENT" && msg[1] === subId && msg[2]) {
            events.push(msg[2] as NostrEvent);
            if (limit && events.length >= limit) finish(true);
          } else if (msg[0] === "EOSE" && msg[1] === subId) {
            finish(true);
          }
        } catch {
          // ignore malformed messages
        }
      });

      ws.on("error", (err: any) => {
        finish(false, err instanceof Error ? err.message : String(err));
      });

      ws.on("close", () => {
        // If the relay closes before EOSE and we haven't finished, treat as partial success.
        finish(events.length > 0, events.length > 0 ? "closed" : "closed_no_events");
      });
    });

  const results = await Promise.allSettled(relays.map(queryOne));
  const details: string[] = [];
  const allEvents: NostrEvent[] = [];
  let okRelays = 0;

  for (const r of results) {
    if (r.status === "fulfilled") {
      okRelays += r.value.ok ? 1 : 0;
      details.push(`${r.value.relay}: ${r.value.ok ? "ok" : `fail (${r.value.reason || "unknown"})`}`);
      allEvents.push(...r.value.events);
    } else {
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
      details.push(`unknown: fail (${reason})`);
    }
  }

  // Deduplicate by id
  const uniq = new Map<string, NostrEvent>();
  for (const ev of allEvents) {
    if (ev?.id) uniq.set(ev.id, ev);
  }

  return { success: okRelays > 0, events: Array.from(uniq.values()), details };
}

export const queryEventsToolConfig = {
  relays: z.array(z.string()).optional().describe("Optional list of relays to query"),
  kinds: z.array(z.number().int().nonnegative()).optional().describe("Optional list of event kinds"),
  authors: z
    .array(z.string())
    .optional()
    .describe("Optional list of authors (hex pubkeys, npub, or nprofile)"),
  ids: z
    .array(z.string())
    .optional()
    .describe("Optional list of event ids (64-hex, note, or nevent)"),
  since: z.number().int().nonnegative().optional().describe("Optional start timestamp (unix seconds)"),
  until: z.number().int().nonnegative().optional().describe("Optional end timestamp (unix seconds)"),
  limit: z.number().int().min(1).max(200).default(25).describe("Maximum number of events to fetch"),
  tags: z
    .record(z.string(), z.array(z.string()))
    .optional()
    .describe("Optional tag filters, e.g. { p: [pubkey], e: [eventId], t: [hashtag] }"),
  search: z.string().optional().describe("Optional NIP-50 search string (relay support varies)"),
};

export async function queryEvents(
  params: {
    relays?: string[];
    kinds?: number[];
    authors?: string[];
    ids?: string[];
    since?: number;
    until?: number;
    limit?: number;
    tags?: Record<string, string[]>;
    search?: string;
  },
): Promise<{ success: boolean; message: string; events?: NostrEvent[] }> {
  const relays = params.relays?.length ? params.relays : DEFAULT_RELAYS;

  const filter: NostrFilter = {
    limit: params.limit ?? 25,
  };

  if (params.kinds?.length) filter.kinds = params.kinds;

  if (params.authors?.length) {
    const normalized = params.authors.map(normalizePubkey).filter((v): v is string => !!v);
    if (normalized.length !== params.authors.length) {
      return { success: false, message: "One or more author identifiers are invalid (expected hex pubkey, npub, or nprofile)." };
    }
    filter.authors = normalized;
  }

  if (params.ids?.length) {
    const normalized = params.ids.map(normalizeEventId).filter((v): v is string => !!v);
    if (normalized.length !== params.ids.length) {
      return { success: false, message: "One or more event identifiers are invalid (expected 64-hex id, note, or nevent)." };
    }
    filter.ids = normalized;
  }

  if (typeof params.since === "number") filter.since = params.since;
  if (typeof params.until === "number") filter.until = params.until;

  if (params.tags) {
    for (const [k, v] of Object.entries(params.tags)) {
      const key = String(k).trim();
      if (!/^[a-zA-Z0-9]{1,32}$/.test(key)) {
        return { success: false, message: `Invalid tag filter key "${key}".` };
      }
      (filter as any)[`#${key}`] = v;
    }
  }

  if (params.search) (filter as any).search = params.search;

  const wsResult = await queryEventsOverWebSocket(relays, filter, QUERY_TIMEOUT);
  if (!wsResult.success) {
    return {
      success: false,
      message: `Error querying events: all relays failed.\n\nResults:\n${wsResult.details.join("\n")}`,
    };
  }

  const events = wsResult.events;
  events.sort((a, b) => b.created_at - a.created_at);
  return {
    success: true,
    message: `Found ${events.length} events.`,
    events,
  };
}

export const createNostrEventToolConfig = {
  kind: z.number().int().nonnegative().describe("Event kind"),
  content: z.string().default("").describe("Event content"),
  tags: z.array(z.array(z.string())).optional().describe("Optional tags to include with the event"),
  createdAt: z.number().int().nonnegative().optional().describe("Optional created_at timestamp (unix seconds)"),
  pubkey: z
    .string()
    .optional()
    .describe("Author public key (hex pubkey, npub, or nprofile). Provide this OR privateKey."),
  privateKey: z
    .string()
    .optional()
    .describe("Private key (hex or nsec) to derive pubkey. Provide this OR pubkey."),
};

export async function createNostrEvent(params: {
  kind: number;
  content: string;
  tags?: string[][];
  createdAt?: number;
  pubkey?: string;
  privateKey?: string;
}): Promise<{ success: boolean; message: string; event?: Omit<NostrEvent, "id" | "sig"> }> {
  try {
    const tags = params.tags ?? [];
    const created_at = params.createdAt ?? Math.floor(Date.now() / 1000);

    let pubkey: string | null = null;
    if (params.pubkey) pubkey = normalizePubkey(params.pubkey);
    if (!pubkey && params.privateKey) pubkey = pubkeyFromPrivateKey(normalizePrivateKey(params.privateKey));

    if (!pubkey) {
      return { success: false, message: "You must provide either pubkey (hex/npub/nprofile) or privateKey (hex/nsec)." };
    }

    const evt = createEvent(
      {
        kind: params.kind,
        content: params.content ?? "",
        tags,
        created_at,
      },
      pubkey,
    );

    return { success: true, message: "Unsigned event created successfully.", event: evt as any };
  } catch (error) {
    return { success: false, message: `Error creating event: ${error instanceof Error ? error.message : "Unknown error"}` };
  }
}

export const signNostrEventToolConfig = {
  privateKey: z.string().describe("Private key to sign the event with (hex format or nsec format)"),
  event: z
    .object({
      pubkey: z.string().describe("Author pubkey (hex)"),
      created_at: z.number().describe("Creation timestamp"),
      kind: z.number().describe("Event kind"),
      tags: z.array(z.array(z.string())).describe("Tags array"),
      content: z.string().describe("Event content"),
    })
    .describe("Unsigned event to sign"),
};

export async function signNostrEvent(params: {
  privateKey: string;
  event: Omit<NostrEvent, "id" | "sig">;
}): Promise<{ success: boolean; message: string; signedEvent?: NostrEvent }> {
  try {
    const privateKeyHex = normalizePrivateKey(params.privateKey);
    const eventTemplate = params.event;

    // snstr's getEventHash/signEvent expect the same event envelope used elsewhere in this repo.
    const id = await getEventHash(eventTemplate as any);
    const sig = await signEvent(id, privateKeyHex);
    const signed: NostrEvent = { ...(eventTemplate as any), id, sig };

    return { success: true, message: "Event signed successfully.", signedEvent: signed };
  } catch (error) {
    return { success: false, message: `Error signing event: ${error instanceof Error ? error.message : "Unknown error"}` };
  }
}

export const publishNostrEventToolConfig = {
  relays: z.array(z.string()).optional().describe("Optional list of relays to publish to"),
  signedEvent: z
    .object({
      id: z.string().describe("Event ID"),
      pubkey: z.string().describe("Author pubkey"),
      created_at: z.number().describe("Creation timestamp"),
      kind: z.number().describe("Event kind"),
      tags: z.array(z.array(z.string())).describe("Tags array"),
      content: z.string().describe("Event content"),
      sig: z.string().describe("Event signature"),
    })
    .describe("Signed event to publish"),
};

export async function publishNostrEvent(params: {
  signedEvent: NostrEvent;
  relays?: string[];
}): Promise<{ success: boolean; message: string; acceptedBy?: number; relayCount?: number }> {
  const relays = params.relays?.length ? params.relays : DEFAULT_RELAYS;

  if (relays.length === 0) {
    return { success: true, message: "No relays specified; nothing was published.", acceptedBy: 0, relayCount: 0 };
  }

  const publishOne = (relayUrl: string) =>
    new Promise<{ relay: string; ok: boolean; reason?: string }>((resolve) => {
      let finished = false;
      let timer: any = null;

      const finish = (ok: boolean, reason?: string) => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        try {
          ws.close();
        } catch {
          // ignore
        }
        resolve({ relay: relayUrl, ok, reason });
      };

      const ws = new WebSocket(relayUrl);
      timer = setTimeout(() => finish(false, "timeout"), QUERY_TIMEOUT);

      ws.on("open", () => {
        try {
          ws.send(JSON.stringify(["EVENT", params.signedEvent]));
        } catch (e: any) {
          finish(false, `send_failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      });

      ws.on("message", (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          if (!Array.isArray(msg) || msg.length < 2) return;
          if (msg[0] === "OK" && msg[1] === params.signedEvent.id) {
            finish(msg[2] === true, typeof msg[3] === "string" ? msg[3] : undefined);
          }
        } catch {
          // ignore malformed
        }
      });

      ws.on("error", (err: any) => {
        finish(false, err instanceof Error ? err.message : String(err));
      });

      ws.on("close", () => {
        // If closed before OK, treat as failure.
        finish(false, "closed");
      });
    });

  const results = await Promise.allSettled(relays.map(publishOne));
  const details: string[] = [];
  let successCount = 0;

  for (const r of results) {
    if (r.status === "fulfilled") {
      successCount += r.value.ok ? 1 : 0;
      details.push(`${r.value.relay}: ${r.value.ok ? "ok" : `fail (${r.value.reason || "unknown"})`}`);
    } else {
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
      details.push(`unknown: fail (${reason})`);
    }
  }

  if (successCount === 0) {
    return {
      success: false,
      message: `Failed to publish event to any relay.\n\nResults:\n${details.join("\n")}`,
      acceptedBy: 0,
      relayCount: relays.length,
    };
  }

  return {
    success: true,
    message: `Event published to ${successCount}/${relays.length} relays.`,
    acceptedBy: successCount,
    relayCount: relays.length,
  };
}

export function formatEventsList(events: NostrEvent[]): string {
  return events.map(formatEventForDisplay).join("\n");
}
