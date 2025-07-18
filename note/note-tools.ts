import { z } from "zod";
import {
  NostrEvent,
  DEFAULT_RELAYS
} from "../utils/index.js";
import { generateKeypair, createEvent, getEventHash, signEvent } from "snstr";
import { getFreshPool } from "../utils/index.js";

// Schema for getProfile tool
export const getProfileToolConfig = {
  pubkey: z.string().describe("Public key of the Nostr user (hex format or npub format)"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query"),
};

// Schema for getKind1Notes tool
export const getKind1NotesToolConfig = {
  pubkey: z.string().describe("Public key of the Nostr user (hex format or npub format)"),
  limit: z.number().min(1).max(100).default(10).describe("Maximum number of notes to fetch"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query"),
};

// Schema for getLongFormNotes tool
export const getLongFormNotesToolConfig = {
  pubkey: z.string().describe("Public key of the Nostr user (hex format or npub format)"),
  limit: z.number().min(1).max(100).default(10).describe("Maximum number of notes to fetch"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query"),
};

// Schema for postAnonymousNote tool
export const postAnonymousNoteToolConfig = {
  content: z.string().describe("Content of the note to post"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to publish to"),
  tags: z.array(z.array(z.string())).optional().describe("Optional tags to include with the note"),
};

// Helper function to format profile data
export function formatProfile(profile: NostrEvent): string {
  if (!profile) return "No profile found";
  
  let metadata: any = {};
  try {
    metadata = profile.content ? JSON.parse(profile.content) : {};
  } catch (e) {
    console.error("Error parsing profile metadata:", e);
  }
  
  return [
    `Name: ${metadata.name || "Unknown"}`,
    `Display Name: ${metadata.display_name || metadata.displayName || metadata.name || "Unknown"}`,
    `About: ${metadata.about || "No about information"}`,
    `NIP-05: ${metadata.nip05 || "Not set"}`,
    `Lightning Address (LUD-16): ${metadata.lud16 || "Not set"}`,
    `LNURL (LUD-06): ${metadata.lud06 || "Not set"}`,
    `Picture: ${metadata.picture || "No picture"}`,
    `Website: ${metadata.website || "No website"}`,
    `Created At: ${new Date(profile.created_at * 1000).toISOString()}`,
  ].join("\n");
}

// Helper function to format note content
export function formatNote(note: NostrEvent): string {
  if (!note) return "";
  
  const created = new Date(note.created_at * 1000).toLocaleString();
  
  return [
    `ID: ${note.id}`,
    `Created: ${created}`,
    `Content: ${note.content}`,
    `---`,
  ].join("\n");
}

/**
 * Post an anonymous note to the Nostr network
 * Generates a one-time keypair and publishes the note to specified relays
 */
export async function postAnonymousNote(
  content: string,
  relays: string[] = DEFAULT_RELAYS,
  tags: string[][] = []
): Promise<{ success: boolean, message: string, noteId?: string, publicKey?: string }> {
  try {
    console.error(`Preparing to post anonymous note to ${relays.join(", ")}`);
    
    // Create a fresh pool for this request
    const pool = getFreshPool(relays);
    
    try {
      // Generate a one-time keypair for anonymous posting
      const keys = await generateKeypair();
      
      // Create the note event template
      const noteTemplate = createEvent({
        kind: 1, // kind 1 is a text note
        content,
        tags
      }, keys.publicKey);
      
      // Get event hash and sign it
      const eventId = await getEventHash(noteTemplate);
      const signature = await signEvent(eventId, keys.privateKey);
      
      // Create complete signed event
      const signedNote = {
        ...noteTemplate,
        id: eventId,
        sig: signature
      };
      
      const publicKey = keys.publicKey;
      
      // Publish to relays
      const pubPromises = relays.map(relay => 
        pool.publish([relay], signedNote)
      );
      
      // Wait for all publish attempts to complete or timeout
      const results = await Promise.allSettled(pubPromises);
      
      // Check if at least one relay accepted the note
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      
      if (successCount === 0) {
        return {
          success: false,
          message: 'Failed to publish note to any relay',
        };
      }
      
      return {
        success: true,
        message: `Note published to ${successCount}/${relays.length} relays`,
        noteId: signedNote.id,
        publicKey: publicKey,
      };
    } catch (error) {
      console.error("Error posting anonymous note:", error);
      
      return {
        success: false,
        message: `Error posting anonymous note: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    } finally {
      // Clean up any subscriptions and close the pool
      await pool.close(relays);
    }
  } catch (error) {
    return {
      success: false,
      message: `Fatal error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
} 