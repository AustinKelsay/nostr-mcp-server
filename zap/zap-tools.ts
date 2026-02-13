import { z } from "zod";
import { decode } from "light-bolt11-decoder";
import { decode as nip19decode, generateKeypair, createEvent, getEventHash, signEvent } from "snstr";
import {
  NostrEvent,
  NostrFilter,
  KINDS,
  DEFAULT_RELAYS,
  FALLBACK_RELAYS,
  QUERY_TIMEOUT,
  getFreshPool,
  npubToHex,
  hexToNpub
} from "../utils/index.js";

// Interface for LNURL response data
export interface LnurlPayResponse {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  commentAllowed?: number;
  nostrPubkey?: string; // Required for NIP-57 zaps
  allowsNostr?: boolean;
}

// Interface for LNURL callback response
export interface LnurlCallbackResponse {
  pr: string; // Lightning invoice
  routes: any[];
  success?: boolean;
  reason?: string;
}

// Zap-specific interfaces based on NIP-57
export interface ZapRequest {
  kind: 9734;
  content: string;
  tags: string[][];
  pubkey: string;
  id: string;
  sig: string;
  created_at: number;
}

export interface ZapReceipt {
  kind: 9735;
  content: string;
  tags: string[][];
  pubkey: string;
  id: string;
  sig: string;
  created_at: number;
}

export interface ZapRequestData {
  pubkey: string;
  content: string;
  created_at: number;
  id: string;
  amount?: number;
  relays?: string[];
  event?: string;
  lnurl?: string;
}

// Define a zap direction type for better code clarity
export type ZapDirection = 'sent' | 'received' | 'self' | 'unknown';

// Define a cached zap type that includes direction
export interface CachedZap extends ZapReceipt {
  direction?: ZapDirection;
  amountSats?: number;
  targetPubkey?: string;
  targetEvent?: string;
  targetCoordinate?: string;
  processedAt: number;
}

// Simple cache implementation for zap receipts
export class ZapCache {
  private cache: Map<string, CachedZap> = new Map();
  private maxSize: number;
  private ttlMs: number;
  
  constructor(maxSize = 1000, ttlMinutes = 10) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMinutes * 60 * 1000;
  }
  
  add(zapReceipt: ZapReceipt, enrichedData?: Partial<CachedZap>): CachedZap {
    // Create enriched zap with processing timestamp
    const cachedZap: CachedZap = {
      ...zapReceipt,
      ...enrichedData,
      processedAt: Date.now()
    };
    
    // Add to cache
    this.cache.set(zapReceipt.id, cachedZap);
    
    // Clean cache if it exceeds max size
    if (this.cache.size > this.maxSize) {
      this.cleanup();
    }
    
    return cachedZap;
  }
  
  get(id: string): CachedZap | undefined {
    const cachedZap = this.cache.get(id);
    
    // Return undefined if not found or expired
    if (!cachedZap || Date.now() - cachedZap.processedAt > this.ttlMs) {
      if (cachedZap) {
        // Remove expired entry
        this.cache.delete(id);
      }
      return undefined;
    }
    
    return cachedZap;
  }
  
  cleanup(): void {
    const now = Date.now();
    
    // Remove expired entries
    for (const [id, zap] of this.cache.entries()) {
      if (now - zap.processedAt > this.ttlMs) {
        this.cache.delete(id);
      }
    }
    
    // If still too large, remove oldest entries
    if (this.cache.size > this.maxSize) {
      const sortedEntries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].processedAt - b[1].processedAt);
      
      const entriesToRemove = sortedEntries.slice(0, sortedEntries.length - Math.floor(this.maxSize * 0.75));
      
      for (const [id] of entriesToRemove) {
        this.cache.delete(id);
      }
    }
  }
}

// Create a global cache instance
export const zapCache = new ZapCache();

// Helper function to parse zap request data from description tag in zap receipt
export function parseZapRequestData(zapReceipt: NostrEvent): ZapRequestData | undefined {
  try {
    // Find the description tag which contains the zap request JSON
    const descriptionTag = zapReceipt.tags.find(tag => tag[0] === "description" && tag.length > 1);
    
    if (!descriptionTag || !descriptionTag[1]) {
      return undefined;
    }
    
    // Parse the zap request JSON - this contains a serialized ZapRequest
    const zapRequest: ZapRequest = JSON.parse(descriptionTag[1]);
    
    // Convert to the ZapRequestData format
    const zapRequestData: ZapRequestData = {
      pubkey: zapRequest.pubkey,
      content: zapRequest.content,
      created_at: zapRequest.created_at,
      id: zapRequest.id,
    };
    
    // Extract additional data from ZapRequest tags
    zapRequest.tags.forEach(tag => {
      if (tag[0] === 'amount' && tag[1]) {
        zapRequestData.amount = parseInt(tag[1], 10);
      } else if (tag[0] === 'relays' && tag.length > 1) {
        zapRequestData.relays = tag.slice(1);
      } else if (tag[0] === 'e' && tag[1]) {
        zapRequestData.event = tag[1];
      } else if (tag[0] === 'lnurl' && tag[1]) {
        zapRequestData.lnurl = tag[1];
      }
    });
    
    return zapRequestData;
  } catch (error) {
    console.error("Error parsing zap request data:", error);
    return undefined;
  }
}

// Helper function to extract and decode bolt11 invoice from a zap receipt
export function decodeBolt11FromZap(zapReceipt: NostrEvent): any | undefined {
  try {
    // Find the bolt11 tag
    const bolt11Tag = zapReceipt.tags.find(tag => tag[0] === "bolt11" && tag.length > 1);
    
    if (!bolt11Tag || !bolt11Tag[1]) {
      return undefined;
    }
    
    // Decode the bolt11 invoice
    const decodedInvoice = decode(bolt11Tag[1]);
    
    return decodedInvoice;
  } catch (error) {
    console.error("Error decoding bolt11 invoice:", error);
    return undefined;
  }
}

// Extract amount in sats from decoded bolt11 invoice
export function getAmountFromDecodedInvoice(decodedInvoice: any): number | undefined {
  try {
    if (!decodedInvoice || !decodedInvoice.sections) {
      return undefined;
    }
    
    // Find the amount section
    const amountSection = decodedInvoice.sections.find((section: any) => section.name === "amount");
    
    if (!amountSection) {
      return undefined;
    }
    
    // Convert msats to sats
    const amountMsats = amountSection.value;
    const amountSats = Math.floor(amountMsats / 1000);
    
    return amountSats;
  } catch (error) {
    console.error("Error extracting amount from decoded invoice:", error);
    return undefined;
  }
}

// Validate a zap receipt according to NIP-57 Appendix F
export function validateZapReceipt(zapReceipt: NostrEvent, zapRequest?: ZapRequest): { valid: boolean, reason?: string } {
  try {
    // 1. Must be kind 9735
    if (zapReceipt.kind !== KINDS.ZapReceipt) {
      return { valid: false, reason: "Not a zap receipt (kind 9735)" };
    }
    
    // 2. Must have a bolt11 tag
    const bolt11Tag = zapReceipt.tags.find(tag => tag[0] === "bolt11" && tag.length > 1);
    if (!bolt11Tag || !bolt11Tag[1]) {
      return { valid: false, reason: "Missing bolt11 tag" };
    }
    
    // 3. Must have a description tag with the zap request
    const descriptionTag = zapReceipt.tags.find(tag => tag[0] === "description" && tag.length > 1);
    if (!descriptionTag || !descriptionTag[1]) {
      return { valid: false, reason: "Missing description tag" };
    }
    
    // 4. Parse the zap request from the description tag if not provided
    let parsedZapRequest: ZapRequest;
    try {
      parsedZapRequest = zapRequest || JSON.parse(descriptionTag[1]);
    } catch (e) {
      return { valid: false, reason: "Invalid zap request JSON in description tag" };
    }
    
    // 5. Validate the zap request structure
    if (parsedZapRequest.kind !== KINDS.ZapRequest) {
      return { valid: false, reason: "Invalid zap request kind" };
    }
    
    // 6. Check that the p tag from the zap request is included in the zap receipt
    const requestedRecipientPubkey = parsedZapRequest.tags.find(tag => tag[0] === 'p' && tag.length > 1)?.[1];
    const receiptRecipientTag = zapReceipt.tags.find(tag => tag[0] === 'p' && tag.length > 1);
    
    if (!requestedRecipientPubkey || !receiptRecipientTag || receiptRecipientTag[1] !== requestedRecipientPubkey) {
      return { valid: false, reason: "Recipient pubkey mismatch" };
    }
    
    // 7. Check for optional e tag consistency if present in the zap request
    const requestEventTag = parsedZapRequest.tags.find(tag => tag[0] === 'e' && tag.length > 1);
    if (requestEventTag) {
      const receiptEventTag = zapReceipt.tags.find(tag => tag[0] === 'e' && tag.length > 1);
      if (!receiptEventTag || receiptEventTag[1] !== requestEventTag[1]) {
        return { valid: false, reason: "Event ID mismatch" };
      }
    }
    
    // 8. Check for optional amount consistency
    const amountTag = parsedZapRequest.tags.find(tag => tag[0] === 'amount' && tag.length > 1);
    if (amountTag) {
      // Decode the bolt11 invoice to verify the amount
      const decodedInvoice = decodeBolt11FromZap(zapReceipt);
      if (decodedInvoice) {
        const invoiceAmountMsats = decodedInvoice.sections.find((s: any) => s.name === "amount")?.value;
        const requestAmountMsats = parseInt(amountTag[1], 10);
        
        if (invoiceAmountMsats && Math.abs(invoiceAmountMsats - requestAmountMsats) > 10) { // Allow small rounding differences
          return { valid: false, reason: "Amount mismatch between request and invoice" };
        }
      }
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, reason: `Validation error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// Determine the direction of a zap relative to a pubkey
export function determineZapDirection(zapReceipt: ZapReceipt, pubkey: string): ZapDirection {
  try {
    // Check if received via lowercase 'p' tag (recipient)
    const isReceived = zapReceipt.tags.some(tag => tag[0] === 'p' && tag[1] === pubkey);
    
    // Check if sent via uppercase 'P' tag (sender, per NIP-57)
    let isSent = zapReceipt.tags.some(tag => tag[0] === 'P' && tag[1] === pubkey);
    
    if (!isSent) {
      // Fallback: check description tag for the sender pubkey
      const descriptionTag = zapReceipt.tags.find(tag => tag[0] === "description" && tag.length > 1);
      if (descriptionTag && descriptionTag[1]) {
        try {
          const zapRequest: ZapRequest = JSON.parse(descriptionTag[1]);
          isSent = zapRequest && zapRequest.pubkey === pubkey;
        } catch (e) {
          // Ignore parsing errors
        }
      }
    }
    
    // Determine direction
    if (isSent && isReceived) {
      return 'self';
    } else if (isSent) {
      return 'sent';
    } else if (isReceived) {
      return 'received';
    } else {
      return 'unknown';
    }
  } catch (error) {
    console.error("Error determining zap direction:", error);
    return 'unknown';
  }
}

// Process a zap receipt into an enriched cached zap
export function processZapReceipt(zapReceipt: ZapReceipt, pubkey: string): CachedZap {
  // Check if we already have this zap in the cache
  const existingCachedZap = zapCache.get(zapReceipt.id);
  if (existingCachedZap) {
    return existingCachedZap;
  }
  
  try {
    // Determine direction relative to the specified pubkey
    const direction = determineZapDirection(zapReceipt, pubkey);
    
    // Extract target pubkey (recipient)
    const targetPubkey = zapReceipt.tags.find(tag => tag[0] === 'p' && tag.length > 1)?.[1];
    
    // Extract target event if any
    const targetEvent = zapReceipt.tags.find(tag => tag[0] === 'e' && tag.length > 1)?.[1];
    
    // Extract target coordinate if any (a tag)
    const targetCoordinate = zapReceipt.tags.find(tag => tag[0] === 'a' && tag.length > 1)?.[1];
    
    // Parse zap request to get additional data
    const zapRequestData = parseZapRequestData(zapReceipt);
    
    // Decode bolt11 invoice to get amount
    const decodedInvoice = decodeBolt11FromZap(zapReceipt);
    const amountSats = decodedInvoice ? 
      getAmountFromDecodedInvoice(decodedInvoice) : 
      (zapRequestData?.amount ? Math.floor(zapRequestData.amount / 1000) : undefined);
    
    // Create enriched zap and add to cache
    return zapCache.add(zapReceipt, {
      direction,
      amountSats,
      targetPubkey,
      targetEvent,
      targetCoordinate
    });
  } catch (error) {
    console.error("Error processing zap receipt:", error);
    // Still cache the basic zap with unknown direction
    return zapCache.add(zapReceipt, { direction: 'unknown' });
  }
}

// Helper function to format zap receipt with enhanced information
export function formatZapReceipt(zap: NostrEvent, pubkeyContext?: string): string {
  if (!zap) return "";
  
  try {
    // Cast to ZapReceipt for better type safety since we know we're dealing with kind 9735
    const zapReceipt = zap as ZapReceipt;
    
    // Process the zap receipt with context if provided
    let enrichedZap: CachedZap;
    if (pubkeyContext) {
      enrichedZap = processZapReceipt(zapReceipt, pubkeyContext);
    } else {
      // Check if it's already in cache
      const cachedZap = zapCache.get(zapReceipt.id);
      if (cachedZap) {
        enrichedZap = cachedZap;
      } else {
        // Process without context - won't have direction information
        enrichedZap = {
          ...zapReceipt,
          processedAt: Date.now()
        };
      }
    }
    
    // Get basic zap info
    const created = new Date(zapReceipt.created_at * 1000).toLocaleString();
    
    // Get sender information from P tag or description
    let sender = "Unknown";
    let senderPubkey: string | undefined;
    const senderPTag = zapReceipt.tags.find(tag => tag[0] === 'P' && tag.length > 1);
    if (senderPTag && senderPTag[1]) {
      senderPubkey = senderPTag[1];
      const npub = hexToNpub(senderPubkey);
      sender = npub ? `${npub.slice(0, 8)}...${npub.slice(-4)}` : `${senderPubkey.slice(0, 8)}...${senderPubkey.slice(-8)}`;
    } else {
      // Try to get from description
      const zapRequestData = parseZapRequestData(zapReceipt);
      if (zapRequestData?.pubkey) {
        senderPubkey = zapRequestData.pubkey;
        const npub = hexToNpub(senderPubkey);
        sender = npub ? `${npub.slice(0, 8)}...${npub.slice(-4)}` : `${senderPubkey.slice(0, 8)}...${senderPubkey.slice(-8)}`;
      }
    }
    
    // Get recipient information
    const recipient = zapReceipt.tags.find(tag => tag[0] === 'p' && tag.length > 1)?.[1];
    let formattedRecipient = "Unknown";
    if (recipient) {
      const npub = hexToNpub(recipient);
      formattedRecipient = npub ? `${npub.slice(0, 8)}...${npub.slice(-4)}` : `${recipient.slice(0, 8)}...${recipient.slice(-8)}`;
    }
    
    // Get amount
    let amount: string = enrichedZap.amountSats !== undefined ? 
      `${enrichedZap.amountSats} sats` : 
      "Unknown";
    
    // Get comment
    let comment = "No comment";
    const zapRequestData = parseZapRequestData(zapReceipt);
    if (zapRequestData?.content) {
      comment = zapRequestData.content;
    }
    
    // Check if this zap is for a specific event or coordinate
    let zapTarget = "User";
    let targetId = "";
    
    if (enrichedZap.targetEvent) {
      zapTarget = "Event";
      targetId = enrichedZap.targetEvent;
    } else if (enrichedZap.targetCoordinate) {
      zapTarget = "Replaceable Event";
      targetId = enrichedZap.targetCoordinate;
    }
    
    // Format the output with all available information
    const lines = [
      `From: ${sender}`,
      `To: ${formattedRecipient}`,
      `Amount: ${amount}`,
      `Created: ${created}`,
      `Target: ${zapTarget}${targetId ? ` (${targetId.slice(0, 8)}...)` : ''}`,
      `Comment: ${comment}`,
    ];
    
    // Add payment preimage if available
    const preimageTag = zapReceipt.tags.find(tag => tag[0] === "preimage" && tag.length > 1);
    if (preimageTag && preimageTag[1]) {
      lines.push(`Preimage: ${preimageTag[1].slice(0, 10)}...`);
    }
    
    // Add payment hash if available in bolt11 invoice
    const decodedInvoice = decodeBolt11FromZap(zapReceipt);
    if (decodedInvoice) {
      const paymentHashSection = decodedInvoice.sections.find((section: any) => section.name === "payment_hash");
      if (paymentHashSection) {
        lines.push(`Payment Hash: ${paymentHashSection.value.slice(0, 10)}...`);
      }
    }
    
    // Add direction information if available
    if (enrichedZap.direction && enrichedZap.direction !== 'unknown') {
      const directionLabels = {
        'sent': '↑ SENT',
        'received': '↓ RECEIVED',
        'self': '↻ SELF ZAP'
      };
      
      lines.unshift(`[${directionLabels[enrichedZap.direction]}]`);
    }
    
    lines.push('---');
    
    return lines.join("\n");
  } catch (error) {
    console.error("Error formatting zap receipt:", error);
    return "Error formatting zap receipt";
  }
}

// Export the tool configurations
export const getReceivedZapsToolConfig = {
  pubkey: z.string().describe("Public key of the Nostr user (hex format or npub format)"),
  limit: z.number().min(1).max(100).default(10).describe("Maximum number of zaps to fetch"),
  since: z.number().int().nonnegative().optional().describe("Optional start timestamp (unix seconds)"),
  until: z.number().int().nonnegative().optional().describe("Optional end timestamp (unix seconds)"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query"),
  validateReceipts: z.boolean().default(true).describe("Whether to validate zap receipts according to NIP-57"),
  debug: z.boolean().default(false).describe("Enable verbose debug logging"),
};

export const getSentZapsToolConfig = {
  pubkey: z.string().describe("Public key of the Nostr user (hex format or npub format)"),
  limit: z.number().min(1).max(100).default(10).describe("Maximum number of zaps to fetch"),
  since: z.number().int().nonnegative().optional().describe("Optional start timestamp (unix seconds)"),
  until: z.number().int().nonnegative().optional().describe("Optional end timestamp (unix seconds)"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query"),
  validateReceipts: z.boolean().default(true).describe("Whether to validate zap receipts according to NIP-57"),
  debug: z.boolean().default(false).describe("Enable verbose debug logging"),
};

export const getAllZapsToolConfig = {
  pubkey: z.string().describe("Public key of the Nostr user (hex format or npub format)"),
  limit: z.number().min(1).max(100).default(20).describe("Maximum number of total zaps to fetch"),
  since: z.number().int().nonnegative().optional().describe("Optional start timestamp (unix seconds)"),
  until: z.number().int().nonnegative().optional().describe("Optional end timestamp (unix seconds)"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query"),
  validateReceipts: z.boolean().default(true).describe("Whether to validate zap receipts according to NIP-57"),
  debug: z.boolean().default(false).describe("Enable verbose debug logging"),
};

// Helper function to decode a note identifier (note, nevent, naddr) to its components
export async function decodeEventId(id: string): Promise<{ type: string, eventId?: string, pubkey?: string, kind?: number, relays?: string[], identifier?: string } | null> {
  if (!id) return null;
  
  try {
    // Clean up input
    id = id.trim();
    
    // If it's already a hex event ID
    if (/^[0-9a-fA-F]{64}$/i.test(id)) {
      return {
        type: 'eventId',
        eventId: id.toLowerCase()
      };
    }
    
    // Try to decode as a bech32 entity
    if (id.startsWith('note1') || id.startsWith('nevent1') || id.startsWith('naddr1')) {
      try {
        const decoded = nip19decode(id as `${string}1${string}`);
        
        if (decoded.type === 'note') {
          return {
            type: 'note',
            eventId: decoded.data as string
          };
        } else if (decoded.type === 'nevent') {
          const data = decoded.data as { id: string, relays?: string[], author?: string };
          return {
            type: 'nevent',
            eventId: data.id,
            relays: data.relays,
            pubkey: data.author
          };
        } else if (decoded.type === 'naddr') {
          const data = decoded.data as { identifier: string, pubkey: string, kind: number, relays?: string[] };
          return {
            type: 'naddr',
            pubkey: data.pubkey,
            kind: data.kind,
            relays: data.relays,
            identifier: data.identifier
          };
        }
      } catch (decodeError) {
        console.error("Error decoding event identifier:", decodeError);
        return null;
      }
    }
    
    // Not a valid event identifier format
    return null;
  } catch (error) {
    console.error("Error decoding event identifier:", error);
    return null;
  }
}

// Export the tool configuration for anonymous zap
export const sendAnonymousZapToolConfig = {
  target: z.string().describe("Target to zap - can be a pubkey (hex or npub) or an event ID (nevent, note, naddr, or hex)"),
  amountSats: z.number().min(1).describe("Amount to zap in satoshis"),
  comment: z.string().default("").describe("Optional comment to include with the zap"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query")
};

// Helper functions for the sendAnonymousZap tool
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function extractLnurlMetadata(lnurlData: LnurlPayResponse): { payeeName?: string, payeeEmail?: string } {
  if (!lnurlData.metadata) return {};
  
  try {
    const metadata = JSON.parse(lnurlData.metadata);
    if (!Array.isArray(metadata)) return {};
    
    let payeeName: string | undefined;
    let payeeEmail: string | undefined;
    
    // Extract information from metadata as per LUD-06
    for (const entry of metadata) {
      if (Array.isArray(entry) && entry.length >= 2) {
        if (entry[0] === "text/plain") {
          payeeName = entry[1] as string;
        }
        if (entry[0] === "text/email" || entry[0] === "text/identifier") {
          payeeEmail = entry[1] as string;
        }
      }
    }
    
    return { payeeName, payeeEmail };
  } catch (error) {
    console.error("Error parsing LNURL metadata:", error);
    return {};
  }
}

// Helper function to decode bech32-encoded LNURL
function bech32ToArray(bech32Str: string): Uint8Array {
  // Extract the 5-bit words
  let words: number[] = [];
  for (let i = 0; i < bech32Str.length; i++) {
    const c = bech32Str.charAt(i);
    const charCode = c.charCodeAt(0);
    if (charCode < 33 || charCode > 126) {
      throw new Error(`Invalid character: ${c}`);
    }
    
    const value = "qpzry9x8gf2tvdw0s3jn54khce6mua7l".indexOf(c.toLowerCase());
    if (value === -1) {
      throw new Error(`Invalid character: ${c}`);
    }
    
    words.push(value);
  }
  
  // Convert 5-bit words to 8-bit bytes
  const result = new Uint8Array(Math.floor((words.length * 5) / 8));
  let bitIndex = 0;
  let byteIndex = 0;
  
  for (let i = 0; i < words.length; i++) {
    const value = words[i];
    
    // Extract the bits from this word
    for (let j = 0; j < 5; j++) {
      const bit = (value >> (4 - j)) & 1;
      
      // Set the bit in the result
      if (bit) {
        result[byteIndex] |= 1 << (7 - bitIndex);
      }
      
      bitIndex++;
      if (bitIndex === 8) {
        bitIndex = 0;
        byteIndex++;
      }
    }
  }
  
  return result;
}

// Function to prepare an anonymous zap
export async function prepareAnonymousZap(
  target: string,
  amountSats: number,
  comment: string = "",
  relays: string[] = DEFAULT_RELAYS
): Promise<{ invoice: string, success: boolean, message: string } | null> {
  try {
    // Convert amount to millisats
    const amountMsats = amountSats * 1000;
    
    // Determine if target is a pubkey or an event
    let hexPubkey: string | null = null;
    let eventId: string | null = null;
    let eventCoordinate: { kind: number, pubkey: string, identifier: string } | null = null;
    
    // First, try to parse as a pubkey
    hexPubkey = npubToHex(target);
    
    // If not a pubkey, try to parse as an event identifier
    if (!hexPubkey) {
      const decodedEvent = await decodeEventId(target);
      if (decodedEvent) {
        if (decodedEvent.eventId) {
          eventId = decodedEvent.eventId;
        } else if (decodedEvent.pubkey) {
          // For naddr, we got a pubkey but no event ID
          hexPubkey = decodedEvent.pubkey;
          
          // If this is an naddr, store the information for creating an "a" tag later
          if (decodedEvent.type === 'naddr' && decodedEvent.kind) {
            eventCoordinate = {
              kind: decodedEvent.kind,
              pubkey: decodedEvent.pubkey,
              identifier: decodedEvent.identifier || ''
            };
          }
        }
      }
    }
    
    // If we couldn't determine a valid target, return error
    if (!hexPubkey && !eventId) {
      return {
        invoice: "",
        success: false,
        message: "Invalid target. Please provide a valid npub, hex pubkey, note ID, or event ID."
      };
    }
    
    // Create a fresh pool for this request
    const pool = getFreshPool(relays);
    
    try {
      // Find the user's metadata to get their LNURL
      let profileFilter: NostrFilter = { kinds: [KINDS.Metadata] };
      
      if (hexPubkey) {
        profileFilter = {
          kinds: [KINDS.Metadata],
          authors: [hexPubkey],
        };
      } else if (eventId) {
        // First get the event to find the author
        const eventFilter = { ids: [eventId] };
        
        const eventPromise = pool.get(relays, eventFilter as NostrFilter);
        const event = await Promise.race([
          eventPromise, 
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), QUERY_TIMEOUT))
        ]) as NostrEvent;
        
        if (!event) {
          return {
            invoice: "",
            success: false,
            message: `Could not find event with ID ${eventId}`
          };
        }
        
        hexPubkey = event.pubkey;
        profileFilter = {
          kinds: [KINDS.Metadata],
          authors: [hexPubkey],
        };
      }
      
      // Get the user's profile
      let profile: NostrEvent | null = null;
      
      for (const relaySet of [relays, DEFAULT_RELAYS, FALLBACK_RELAYS]) {
        if (relaySet.length === 0) continue;
        try {
          const profilePromise = pool.get(relaySet, profileFilter as NostrFilter);
          profile = await Promise.race([
            profilePromise, 
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), QUERY_TIMEOUT))
          ]) as NostrEvent;
          
          if (profile) break;
        } catch (error) {
          // Continue to next relay set
        }
      }
      
      if (!profile) {
        return {
          invoice: "",
          success: false,
          message: "Could not find profile for the target user. Their profile may not exist on our known relays."
        };
      }
      
      // Parse the profile to get the lightning address or LNURL
      let lnurl: string | null = null;
      
      try {
        const metadata = JSON.parse(profile.content);
        
        // Check standard LUD-16/LUD-06 fields
        lnurl = metadata.lud16 || metadata.lud06 || null;
        
        // Check for alternate capitalizations that some clients might use
        if (!lnurl) {
          lnurl = metadata.LUD16 || metadata.LUD06 || 
                 metadata.Lud16 || metadata.Lud06 || 
                 metadata.lightning || metadata.LIGHTNING || 
                 metadata.lightningAddress || 
                 null;
        }
        
        if (!lnurl) {
          // Check if there's any key that contains "lud" or "lightning"
          const ludKey = Object.keys(metadata).find(key => 
            key.toLowerCase().includes('lud') || 
            key.toLowerCase().includes('lightning')
          );
          
          if (ludKey) {
            lnurl = metadata[ludKey];
          }
        }
        
        if (!lnurl) {
          return {
            invoice: "",
            success: false,
            message: "Target user does not have a lightning address or LNURL configured in their profile"
          };
        }
        
        // If it's a lightning address (contains @), convert to LNURL
        if (lnurl.includes('@')) {
          const [name, domain] = lnurl.split('@');
          // Per LUD-16, properly encode username with encodeURIComponent
          const encodedName = encodeURIComponent(name);
          lnurl = `https://${domain}/.well-known/lnurlp/${encodedName}`;
        } else if (lnurl.toLowerCase().startsWith('lnurl')) {
          // Decode bech32 LNURL to URL
          try {
            lnurl = Buffer.from(bech32ToArray(lnurl.toLowerCase().substring(5))).toString();
          } catch (e) {
            return {
              invoice: "",
              success: false,
              message: "Invalid LNURL format"
            };
          }
        }
        
        // Make sure it's HTTP or HTTPS if not already
        if (!lnurl.startsWith('http://') && !lnurl.startsWith('https://')) {
          // Default to HTTPS
          lnurl = 'https://' + lnurl;
        }
      } catch (error) {
        return {
          invoice: "",
          success: false,
          message: "Error parsing user profile"
        };
      }
      
      if (!lnurl) {
        return {
          invoice: "",
          success: false,
          message: "Could not determine LNURL from user profile"
        };
      }
      
      // Step 1: Query the LNURL to get the callback URL
      let lnurlResponse;
      try {
        lnurlResponse = await fetch(lnurl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Nostr-MCP-Server/1.0'
          }
        });
        
        if (!lnurlResponse.ok) {
          let errorText = "";
          try {
            errorText = await lnurlResponse.text();
          } catch (e) {
            // Ignore if we can't read the error text
          }
          
          return {
            invoice: "",
            success: false,
            message: `LNURL request failed with status ${lnurlResponse.status}${errorText ? `: ${errorText}` : ""}`
          };
        }
      } catch (error) {
        return {
          invoice: "",
          success: false,
          message: `Error connecting to LNURL: ${error instanceof Error ? error.message : "Unknown error"}`
        };
      }
      
      let lnurlData;
      try {
        const responseText = await lnurlResponse.text();
        lnurlData = JSON.parse(responseText) as LnurlPayResponse;
      } catch (error) {
        return {
          invoice: "",
          success: false,
          message: `Invalid JSON response from LNURL service: ${error instanceof Error ? error.message : "Unknown error"}`
        };
      }
      
      // Check if the service supports NIP-57 zaps
      if (!lnurlData.allowsNostr) {
        return {
          invoice: "",
          success: false,
          message: "The target user's lightning service does not support Nostr zaps"
        };
      }
      
      if (!lnurlData.nostrPubkey) {
        return {
          invoice: "",
          success: false,
          message: "The target user's lightning service does not provide a nostrPubkey for zaps"
        };
      }
      
      // Validate the callback URL
      if (!lnurlData.callback || !isValidUrl(lnurlData.callback)) {
        return {
          invoice: "",
          success: false,
          message: `Invalid callback URL in LNURL response: ${lnurlData.callback}`
        };
      }
      
      // Validate amount limits
      if (!lnurlData.minSendable || !lnurlData.maxSendable) {
        return {
          invoice: "",
          success: false,
          message: "The LNURL service did not provide valid min/max sendable amounts"
        };
      }
      
      if (amountMsats < lnurlData.minSendable) {
        return {
          invoice: "",
          success: false,
          message: `Amount too small. Minimum is ${lnurlData.minSendable / 1000} sats (you tried to send ${amountMsats / 1000} sats)`
        };
      }
      
      if (amountMsats > lnurlData.maxSendable) {
        return {
          invoice: "",
          success: false,
          message: `Amount too large. Maximum is ${lnurlData.maxSendable / 1000} sats (you tried to send ${amountMsats / 1000} sats)`
        };
      }
      
      // Validate comment length if the service has a limit
      if (lnurlData.commentAllowed && comment.length > lnurlData.commentAllowed) {
        comment = comment.substring(0, lnurlData.commentAllowed);
      }
      
      // Step 2: Create the zap request tags
      const zapRequestTags: string[][] = [
        ["relays", ...relays.slice(0, 5)], // Include up to 5 relays
        ["amount", amountMsats.toString()],
        ["lnurl", lnurl]
      ];
      
      // Add p or e tag depending on what we're zapping
      if (hexPubkey) {
        zapRequestTags.push(["p", hexPubkey]);
      }
      
      if (eventId) {
        zapRequestTags.push(["e", eventId]);
      }
      
      // Add a tag for replaceable events (naddr)
      if (eventCoordinate) {
        const aTagValue = `${eventCoordinate.kind}:${eventCoordinate.pubkey}:${eventCoordinate.identifier}`;
        zapRequestTags.push(["a", aTagValue]);
      }
      
      // Create a proper one-time keypair for anonymous zapping
      const anonymousKeys = await generateKeypair();
      const anonymousPubkeyHex = anonymousKeys.publicKey;

      // Create the zap request event template
      const zapRequestTemplate = createEvent({
        kind: 9734,
        content: comment,
        tags: zapRequestTags
      }, anonymousKeys.publicKey);
      
      // Get event hash and sign it
      const zapEventId = await getEventHash(zapRequestTemplate);
      const signature = await signEvent(zapEventId, anonymousKeys.privateKey);
      
      // Create complete signed event
      const signedZapRequest = {
        ...zapRequestTemplate,
        id: zapEventId,
        sig: signature
      };

      // Create different formatted versions of the zap request for compatibility
      const completeEventParam = encodeURIComponent(JSON.stringify(signedZapRequest));
      const basicEventParam = encodeURIComponent(JSON.stringify({
        kind: 9734,
        created_at: Math.floor(Date.now() / 1000),
        content: comment,
        tags: zapRequestTags,
        pubkey: anonymousPubkeyHex
      }));
      const tagsOnlyParam = encodeURIComponent(JSON.stringify({
        tags: zapRequestTags
      }));

      // Try each approach in order
      const approaches = [
        { name: "Complete event with ID/sig", param: completeEventParam },
        { name: "Basic event without ID/sig", param: basicEventParam },
        { name: "Tags only", param: tagsOnlyParam },
        // Add fallback approach without nostr parameter at all
        { name: "No nostr parameter", param: null }
      ];

      // Flag to track if we've successfully processed any approach
      let success = false;
      let finalResult = null;
      let lastError = "";
      
      for (const approach of approaches) {
        if (success) break; // Skip if we already succeeded
        
        // Create a new URL for each attempt to avoid parameter pollution
        const currentCallbackUrl = new URL(lnurlData.callback);
        
        // Add basic parameters - must include amount first per some implementations
        currentCallbackUrl.searchParams.append("amount", amountMsats.toString());
        
        // Add comment if provided and allowed
        if (comment && (!lnurlData.commentAllowed || lnurlData.commentAllowed > 0)) {
          currentCallbackUrl.searchParams.append("comment", comment);
        }
        
        // Add the nostr parameter for this approach (if not null)
        if (approach.param !== null) {
          currentCallbackUrl.searchParams.append("nostr", approach.param);
        }
        
        const callbackUrlString = currentCallbackUrl.toString();
        
        try {
          const callbackResponse = await fetch(callbackUrlString, {
            method: 'GET', // Explicitly use GET as required by LUD-06
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Nostr-MCP-Server/1.0'
            }
          });
          
          // Attempt to read the response body regardless of status code
          let responseText = "";
          try {
            responseText = await callbackResponse.text();
          } catch (e) {
            // Ignore if we can't read the response
          }
          
          if (!callbackResponse.ok) {
            if (responseText) {
              lastError = `Status ${callbackResponse.status}: ${responseText}`;
            } else {
              lastError = `Status ${callbackResponse.status}`;
            }
            continue; // Try the next approach
          }
          
          // Successfully got a 2xx response, now parse it
          let invoiceData;
          try {
            invoiceData = JSON.parse(responseText) as LnurlCallbackResponse;
          } catch (error) {
            lastError = `Invalid JSON in response: ${responseText}`;
            continue; // Try the next approach
          }
          
          // Check if the response has the expected structure
          if (!invoiceData.pr) {
            if (invoiceData.reason) {
              lastError = invoiceData.reason;
              // If the error message mentions the NIP-57/Nostr parameter specifically, try the next approach
              if (lastError.toLowerCase().includes('nostr') || 
                  lastError.toLowerCase().includes('customer') || 
                  lastError.toLowerCase().includes('wallet')) {
                continue; // Try the next approach
              }
            } else {
              lastError = `Missing 'pr' field in response`;
            }
            continue; // Try the next approach
          }
          
          // We got a valid invoice!
          success = true;
          finalResult = {
            invoice: invoiceData.pr,
            success: true,
            message: `Successfully generated invoice using ${approach.name}`
          };
          break; // Exit the loop
        } catch (error) {
          lastError = error instanceof Error ? error.message : "Unknown error";
          // Continue to the next approach
        }
      }
      
      // If none of our approaches worked, return an error with the last error message
      if (!success) {
        return {
          invoice: "",
          success: false,
          message: `Failed to generate invoice: ${lastError}`
        };
      }
      
      return finalResult;
    } catch (error) {
      return {
        invoice: "",
        success: false,
        message: `Error preparing zap: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    } finally {
      // Clean up any subscriptions and close the pool
      await pool.close();
    }
  } catch (error) {
    return {
      invoice: "",
      success: false,
      message: `Fatal error: ${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
} 
