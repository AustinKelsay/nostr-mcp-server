import { hexToNpub } from './conversion.js';
import type { NostrEvent } from "./pool.js";

/**
 * Format a pubkey for display, converting to npub format
 * @param pubkey The pubkey in hex format
 * @param useShortFormat Whether to use a shortened format
 * @returns The formatted pubkey
 */
export function formatPubkey(pubkey: string, useShortFormat = false): string {
  try {
    if (!pubkey) return 'unknown';
    
    // Convert to npub
    const npub = hexToNpub(pubkey);
    
    // If converting to npub failed, return a shortened hex
    if (!npub) {
      return useShortFormat 
        ? `${pubkey.substring(0, 4)}...${pubkey.substring(60)}` 
        : pubkey;
    }
    
    // Return appropriately formatted npub
    if (useShortFormat) {
      // For short format, show the first 8 and last 4 characters of the npub
      return `${npub.substring(0, 8)}...${npub.substring(npub.length - 4)}`;
    } else {
      // For regular format, use the full npub
      return npub;
    }
  } catch (error) {
    console.error('Error formatting pubkey:', error);
    return 'error';
  }
}

export function formatContacts(
  contacts: { pubkey: string; relay?: string; petname?: string }[] = [],
): string {
  if (!contacts.length) return "No contacts.";
  return contacts
    .map((c) => {
      const pk = typeof c?.pubkey === "string" ? formatPubkey(c.pubkey) : "unknown";
      const relay = c?.relay ? ` relay=${c.relay}` : "";
      const pet = c?.petname ? ` petname=${c.petname}` : "";
      return `- ${pk}${relay}${pet}`;
    })
    .join("\n");
}

export function formatRelayList(
  relays: { url: string; read: boolean; write: boolean }[],
): string {
  if (!relays.length) return "No relays.";
  return relays
    .slice()
    .sort((a, b) => a.url.localeCompare(b.url))
    .map((r) => `- ${r.url} (${r.read ? "read" : ""}${r.read && r.write ? "," : ""}${r.write ? "write" : ""})`)
    .join("\n");
}

export function formatEvent(evt: NostrEvent): string {
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

export function formatEvents(events: NostrEvent[]): string {
  return events.map(formatEvent).join("\n");
}
