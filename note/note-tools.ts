import { z } from "zod";
import {
  NostrEvent,
  DEFAULT_RELAYS
} from "../utils/index.js";
import { generateKeypair, createEvent, getEventHash, signEvent, decode as nip19decode } from "snstr";
import { getFreshPool } from "../utils/index.js";
import { schnorr } from '@noble/curves/secp256k1';

// Schema for getProfile tool
export const getProfileToolConfig = {
  pubkey: z.string().describe("Public key of the Nostr user (hex format or npub format)"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query"),
};

// Schema for getKind1Notes tool
export const getKind1NotesToolConfig = {
  pubkey: z.string().describe("Public key of the Nostr user (hex format or npub format)"),
  limit: z.number().min(1).max(100).default(10).describe("Maximum number of notes to fetch"),
  since: z.number().int().nonnegative().optional().describe("Optional start timestamp (unix seconds)"),
  until: z.number().int().nonnegative().optional().describe("Optional end timestamp (unix seconds)"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query"),
};

// Schema for getLongFormNotes tool
export const getLongFormNotesToolConfig = {
  pubkey: z.string().describe("Public key of the Nostr user (hex format or npub format)"),
  limit: z.number().min(1).max(100).default(10).describe("Maximum number of notes to fetch"),
  since: z.number().int().nonnegative().optional().describe("Optional start timestamp (unix seconds)"),
  until: z.number().int().nonnegative().optional().describe("Optional end timestamp (unix seconds)"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to query"),
};

// Schema for postAnonymousNote tool
export const postAnonymousNoteToolConfig = {
  content: z.string().describe("Content of the note to post"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to publish to"),
  tags: z.array(z.array(z.string())).optional().describe("Optional tags to include with the note"),
};

// Schema for createNote tool
export const createNoteToolConfig = {
  privateKey: z.string().describe("Private key to sign the note with (hex format or nsec format)"),
  content: z.string().describe("Content of the note to create"),
  tags: z.array(z.array(z.string())).optional().describe("Optional tags to include with the note"),
};

// Schema for signNote tool
export const signNoteToolConfig = {
  privateKey: z.string().describe("Private key to sign the note with (hex format or nsec format)"),
  noteEvent: z.object({
    kind: z.number().describe("Event kind (should be 1 for text notes)"),
    content: z.string().describe("Content of the note"),
    tags: z.array(z.array(z.string())).describe("Tags array"),
    created_at: z.number().describe("Creation timestamp"),
    pubkey: z.string().describe("Public key of the author")
  }).describe("Unsigned note event to sign"),
};

// Schema for publishNote tool  
export const publishNoteToolConfig = {
  signedNote: z.object({
    id: z.string().describe("Event ID"),
    pubkey: z.string().describe("Public key of the author"),
    created_at: z.number().describe("Creation timestamp"),
    kind: z.number().describe("Event kind"),
    tags: z.array(z.array(z.string())).describe("Tags array"),
    content: z.string().describe("Content of the note"),
    sig: z.string().describe("Event signature")
  }).describe("Signed note event to publish"),
  relays: z.array(z.string()).optional().describe("Optional list of relays to publish to"),
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
    // console.error(`Preparing to post anonymous note to ${relays.join(", ")}`);
    
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
      
      // Publish to relays and wait for actual relay OK responses
      const pubPromises = pool.publish(relays, signedNote);
      
      // Wait for all publish attempts to complete or timeout
      const results = await Promise.allSettled(pubPromises);
      
      // Check if at least one relay actually accepted the event
      // A fulfilled promise means relay responded, but we need to check if it accepted
      const successCount = results.filter(r => 
        r.status === 'fulfilled' && r.value.success === true
      ).length;
      
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
      await pool.close();
    }
  } catch (error) {
    return {
      success: false,
      message: `Fatal error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// Helper function to convert private key to hex if nsec format
function normalizePrivateKey(privateKey: string): string {
  if (privateKey.startsWith('nsec')) {
    const decoded = nip19decode(privateKey as `${string}1${string}`);
    if (decoded.type !== 'nsec') {
      throw new Error('Invalid nsec format');
    }
    return decoded.data;
  }
  return privateKey;
}

// Helper function to derive public key from private key
function getPublicKeyFromPrivate(privateKey: string): string {
  return Buffer.from(schnorr.getPublicKey(privateKey)).toString('hex');
}

/**
 * Create a new kind 1 note event (unsigned)
 */
export async function createNote(
  privateKey: string,
  content: string,
  tags: string[][] = []
): Promise<{ success: boolean, message: string, noteEvent?: any, publicKey?: string }> {
  try {
    // Normalize private key
    const normalizedPrivateKey = normalizePrivateKey(privateKey);
    
    // Derive public key from private key
    const publicKey = getPublicKeyFromPrivate(normalizedPrivateKey);
    
    // Create the note event template
    const noteTemplate = createEvent({
      kind: 1, // kind 1 is a text note
      content,
      tags
    }, publicKey);
    
    return {
      success: true,
      message: 'Note event created successfully (unsigned)',
      noteEvent: noteTemplate,
      publicKey: publicKey,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error creating note: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Sign a note event
 */
export async function signNote(
  privateKey: string,
  noteEvent: {
    kind: number;
    content: string;
    tags: string[][];
    created_at: number;
    pubkey: string;
  }
): Promise<{ success: boolean, message: string, signedNote?: any }> {
  try {
    // Normalize private key
    const normalizedPrivateKey = normalizePrivateKey(privateKey);
    
    // Verify the public key matches the private key
    const derivedPubkey = getPublicKeyFromPrivate(normalizedPrivateKey);
    if (derivedPubkey !== noteEvent.pubkey) {
      return {
        success: false,
        message: 'Private key does not match the public key in the note event',
      };
    }
    
    // Get event hash and sign it
    const eventId = await getEventHash(noteEvent);
    const signature = await signEvent(eventId, normalizedPrivateKey);
    
    // Create complete signed event
    const signedNote = {
      ...noteEvent,
      id: eventId,
      sig: signature
    };
    
    return {
      success: true,
      message: 'Note signed successfully',
      signedNote: signedNote,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error signing note: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Publish a signed note to relays
 */
export async function publishNote(
  signedNote: {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
  },
  relays: string[] = DEFAULT_RELAYS
): Promise<{ success: boolean, message: string, noteId?: string }> {
  try {
    // console.error(`Preparing to publish note to ${relays.join(", ")}`);
    
    // If no relays specified, just return success with event validation
    if (relays.length === 0) {
      return {
        success: true,
        message: 'Note is valid and ready to publish (no relays specified)',
        noteId: signedNote.id,
      };
    }
    
    // Create a fresh pool for this request
    const pool = getFreshPool(relays);
    
    try {
      // Publish to relays and wait for actual relay OK responses
      const pubPromises = pool.publish(relays, signedNote);
      
      // Wait for all publish attempts to complete or timeout
      const results = await Promise.allSettled(pubPromises);
      
      // Check if at least one relay actually accepted the event
      // A fulfilled promise means relay responded, but we need to check if it accepted
      const successCount = results.filter(r => 
        r.status === 'fulfilled' && r.value.success === true
      ).length;
      
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
      };
    } catch (error) {
      console.error("Error publishing note:", error);
      
      return {
        success: false,
        message: `Error publishing note: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    } finally {
      // Clean up any subscriptions and close the pool
      await pool.close();
    }
  } catch (error) {
    return {
      success: false,
      message: `Fatal error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
